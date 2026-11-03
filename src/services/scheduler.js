import { prisma } from '@/lib/prisma';
import { sendPush } from '@/lib/push';
import { localDateTime, nextOccurrenceAfter, occurrencesBetween, todayIn } from '@/lib/time';
import { recordEvent } from '@/services/events';

// Doses from missed ticks are caught up for one day back
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
// cron-job.org gives up at 30 seconds, and the last push can still take 5
const TIME_BUDGET_MS = 20 * 1000;
const BATCH_SIZE = 100;

// The rule time.js reads, and the zone of the patient it belongs to
const SCHEDULE_WITH_ZONE = {
  id: true,
  time: true,
  frequency: true,
  daysOfWeek: true,
  startDate: true,
  endDate: true,
  updatedAt: true,
  medicine: { select: { user: { select: { timezone: true } } } },
};

// What a reminder needs to reach every device of its patient
const DUE_REMINDER_FIELDS = {
  id: true,
  reminderTime: true,
  schedule: {
    select: {
      medicine: {
        select: {
          name: true,
          dosage: true,
          user: {
            select: {
              id: true,
              timezone: true,
              pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
            },
          },
        },
      },
    },
  },
};

// FR10 UC6 One run of the reminder engine; every step is safe to run twice
export async function runTick(now) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const result = { generated: 0, sent: 0, missed: 0 };
  try {
    result.generated = await generateReminders(now, deadline);
  } catch (error) {
    await tickFailed('creating reminders', error);
  }
  try {
    result.sent = await sendDueReminders(now, deadline);
  } catch (error) {
    await tickFailed('sending reminders', error);
  }
  try {
    result.missed = await markMissedDoses(now, deadline);
  } catch (error) {
    await tickFailed('marking missed doses', error);
  }
  return result;
}

// NIR2 The reminder always names the medicine and its local time
export function pushPayload(reminder, medicine, timeZone) {
  const { time } = localDateTime(reminder.reminderTime, timeZone);
  return {
    reminderId: reminder.id,
    title: medicine.name,
    body: `${medicine.dosage} due at ${time}`,
    url: `/doses/${reminder.id}`,
  };
}

// UC6 Missed once the next dose is due; after a last dose, once the next would have been due
export function isMissed(schedule, timeZone, reminderTime, now) {
  const next = nextOccurrenceAfter({ ...schedule, endDate: null }, timeZone, reminderTime);
  return next === null || next.getTime() <= now.getTime();
}

// Only the error kind goes in the message, never patient data (DR5)
function tickFailed(step, error) {
  const kind = error.code ? `${error.name} ${error.code}` : error.name;
  return recordEvent('TICK_FAILED', `The tick stopped while ${step} (${kind}).`);
}

// A @db.Date is stored as UTC midnight; two days of margin covers any zone
function utcDate(instant, days) {
  const date = new Date(instant.toISOString().slice(0, 10));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

// A changed dose time counts from the day it was saved, so it never adds a dose to an earlier day
function countedFromDaySaved(schedule, timeZone) {
  const daySaved = new Date(todayIn(timeZone, schedule.updatedAt));
  if (daySaved.getTime() <= schedule.startDate.getTime()) return schedule;
  return { ...schedule, startDate: daySaved };
}

// Not snoozed, or the snooze is over
function snoozeOver(now) {
  return [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }];
}

// Step 1: every dose due in the last 24 hours gets one reminder row
async function generateReminders(now, deadline) {
  const from = new Date(now.getTime() - LOOKBACK_MS);
  let generated = 0;
  let lastId = 0;
  while (Date.now() < deadline) {
    const schedules = await prisma.schedule.findMany({
      where: {
        id: { gt: lastId },
        medicine: { user: { status: 'ACTIVE' } },
        startDate: { lte: utcDate(now, 2) },
        OR: [{ endDate: null }, { endDate: { gte: utcDate(from, -2) } }],
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: SCHEDULE_WITH_ZONE,
    });

    const rows = [];
    for (const schedule of schedules) {
      const timeZone = schedule.medicine.user.timezone;
      const rule = countedFromDaySaved(schedule, timeZone);
      for (const reminderTime of occurrencesBetween(rule, timeZone, from, now)) {
        rows.push({ scheduleId: schedule.id, reminderTime });
      }
    }
    if (rows.length > 0) {
      // The unique schedule and time pair means a second run adds nothing
      const { count } = await prisma.reminder.createMany({ data: rows, skipDuplicates: true });
      generated += count;
    }

    if (schedules.length < BATCH_SIZE) break;
    lastId = schedules.at(-1).id;
  }
  return generated;
}

// Step 2: claim each due reminder once, then push it
async function sendDueReminders(now, deadline) {
  let sent = 0;
  let lastId = 0;
  while (Date.now() < deadline) {
    const reminders = await prisma.reminder.findMany({
      where: {
        id: { gt: lastId },
        status: 'PENDING',
        reminderTime: { lte: now },
        OR: snoozeOver(now),
        schedule: { medicine: { user: { status: 'ACTIVE' } } },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: DUE_REMINDER_FIELDS,
    });

    for (const reminder of reminders) {
      if (Date.now() >= deadline) return sent;
      // Only one tick gets a count of 1, so two ticks at once never send twice
      const { count } = await prisma.reminder.updateMany({
        where: { id: reminder.id, status: 'PENDING', OR: snoozeOver(now) },
        data: { status: 'SENT', sentAt: now },
      });
      if (count !== 1) continue;
      sent += 1;
      await pushToDevices(reminder);
    }

    if (reminders.length < BATCH_SIZE) break;
    lastId = reminders.at(-1).id;
  }
  return sent;
}

// A failed device is logged and the other devices still get the reminder
async function pushToDevices(reminder) {
  const { medicine } = reminder.schedule;
  const payload = pushPayload(reminder, medicine, medicine.user.timezone);
  const results = await Promise.all(
    medicine.user.pushSubscriptions.map((subscription) => sendPush(subscription, payload)),
  );
  for (const result of results) {
    // sendPush already removed a device that is gone
    if (result.ok || result.gone) continue;
    await recordEvent(
      'PUSH_FAILED',
      'A reminder could not be sent to one device.',
      medicine.user.id,
    );
  }
}

// Step 3 UC6: a dose still unanswered when the next one is due is logged as missed
async function markMissedDoses(now, deadline) {
  let missed = 0;
  let lastId = 0;
  while (Date.now() < deadline) {
    const reminders = await prisma.reminder.findMany({
      where: {
        id: { gt: lastId },
        status: { in: ['PENDING', 'SENT'] },
        reminderTime: { lte: now },
        doseLog: { is: null },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        scheduleId: true,
        reminderTime: true,
        schedule: { select: SCHEDULE_WITH_ZONE },
      },
    });

    for (const reminder of reminders) {
      if (Date.now() >= deadline) return missed;
      const timeZone = reminder.schedule.medicine.user.timezone;
      if (!isMissed(reminder.schedule, timeZone, reminder.reminderTime, now)) continue;
      if (await logMissed(reminder, timeZone)) missed += 1;
    }

    if (reminders.length < BATCH_SIZE) break;
    lastId = reminders.at(-1).id;
  }
  return missed;
}

// The log keeps the dose's own local date and time, as a patient's answer does
async function logMissed(reminder, timeZone) {
  const { date, time } = localDateTime(reminder.reminderTime, timeZone);
  try {
    await prisma.$transaction([
      prisma.doseLog.create({
        data: {
          scheduleId: reminder.scheduleId,
          reminderId: reminder.id,
          status: 'MISSED',
          date: new Date(date),
          time,
        },
      }),
      prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'RESOLVED' } }),
    ]);
    return true;
  } catch (error) {
    // The unique reminderId means the patient or another tick logged this dose first
    if (error.code === 'P2002') return false;
    throw error;
  }
}
