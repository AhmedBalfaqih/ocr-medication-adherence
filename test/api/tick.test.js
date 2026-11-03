import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { POST as tickRoute } from '@/app/api/cron/tick/route';
import { prisma } from '@/lib/prisma';
import { occurrencesBetween } from '@/lib/time';
import { runTick } from '@/services/scheduler';
import { createMedicine, createPatient, createReminder, createSchedule } from '../helpers';

// No push leaves the test; each one reports success unless a test says otherwise
const { sendPush } = vi.hoisted(() => ({ sendPush: vi.fn() }));
vi.mock('@/lib/push', () => ({ sendPush }));

// The made up doses below are in early 2024, when Cairo was UTC+2, so 08:00 there is 06:00 UTC
const CAIRO = 'Africa/Cairo';
const DAY = 24 * 60 * 60 * 1000;
const WRONG_SECRET = { error: { code: 'UNAUTHORIZED', message: 'Wrong cron secret.' } };
const PUSH_FAILED_MESSAGE = 'A reminder could not be sent to one device.';

beforeEach(() => {
  sendPush.mockReset();
  sendPush.mockResolvedValue({ ok: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// cron-job.org sends the secret and no Origin
function tickRequest(secret) {
  const headers = secret === undefined ? {} : { 'x-cron-secret': secret };
  return new NextRequest(new URL('/api/cron/tick', process.env.APP_ORIGIN), {
    method: 'POST',
    headers,
  });
}

// A patient with one medicine and one device, so a sent reminder reaches sendPush
async function patientWithDevice() {
  const { user } = await createPatient();
  const medicine = await createMedicine(user.id, { name: 'Testamol', dosage: '500 mg' });
  const device = await prisma.pushSubscription.create({
    data: {
      userId: user.id,
      endpoint: `https://push.example.com/send/${randomUUID()}`,
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
    },
  });
  return { user, medicine, device };
}

// A daily dose time between two local dates, both days included
function dailyAt(medicineId, time, startDate, endDate = startDate) {
  return createSchedule(medicineId, {
    time,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  });
}

// A @db.Date is stored as UTC midnight
function daysAgo(days) {
  return new Date(new Date(Date.now() - days * DAY).toISOString().slice(0, 10));
}

function remindersOf(scheduleId) {
  return prisma.reminder.findMany({ where: { scheduleId }, orderBy: { reminderTime: 'asc' } });
}

function storedReminder(id) {
  return prisma.reminder.findUnique({ where: { id } });
}

function logsOf(reminderId) {
  return prisma.doseLog.findMany({
    where: { reminderId },
    select: { scheduleId: true, status: true, date: true, time: true },
  });
}

function pushesFor(reminderId) {
  return sendPush.mock.calls.filter(([, payload]) => payload.reminderId === reminderId);
}

function pushesTo(device) {
  return sendPush.mock.calls.filter(([target]) => target.endpoint === device.endpoint);
}

test('a missing, empty or wrong cron secret gets 401 and creates nothing', async () => {
  const { medicine } = await patientWithDevice();
  // Started three days ago, so a dose falls in the last 24 hours
  const schedule = await createSchedule(medicine.id, { startDate: daysAgo(3) });
  const secret = process.env.CRON_SECRET;
  const sameLength = `${secret.slice(0, -1)}${secret.endsWith('x') ? 'y' : 'x'}`;

  for (const given of [undefined, '', 'wrong', sameLength, `${secret}x`]) {
    const response = await tickRoute(tickRequest(given));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(WRONG_SECRET);
  }
  expect(await remindersOf(schedule.id)).toEqual([]);
  expect(sendPush).not.toHaveBeenCalled();
});

test('with no cron secret set on the server every tick gets 401', async () => {
  vi.stubEnv('CRON_SECRET', '');
  try {
    for (const given of [undefined, '']) {
      const response = await tickRoute(tickRequest(given));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(WRONG_SECRET);
    }
  } finally {
    vi.unstubAllEnvs();
  }
});

test('the right cron secret runs the tick and returns the counts', async () => {
  const { medicine } = await patientWithDevice();
  const schedule = await createSchedule(medicine.id, { startDate: daysAgo(3) });

  const before = new Date();
  const response = await tickRoute(tickRequest(process.env.CRON_SECRET));
  const after = new Date();
  expect(response.status).toBe(200);
  const counts = await response.json();
  expect(counts).toEqual({
    generated: expect.any(Number),
    sent: expect.any(Number),
    missed: expect.any(Number),
  });

  // The tick ran between the two moments, so its 24 hour window matches one of them
  const stored = (await remindersOf(schedule.id)).map((row) => row.reminderTime.toISOString());
  const expected = [before, after].map((now) =>
    occurrencesBetween(schedule, CAIRO, new Date(now.getTime() - DAY), now).map((instant) =>
      instant.toISOString(),
    ),
  );
  expect(expected).toContainEqual(stored);
  expect(counts.generated).toBeGreaterThanOrEqual(stored.length);
});

test('two ticks at the same moment leave the same reminder rows', async () => {
  const { medicine } = await patientWithDevice();
  const morning = await dailyAt(medicine.id, '08:00', '2024-01-10', '2024-01-12');
  const evening = await dailyAt(medicine.id, '20:00', '2024-01-10', '2024-01-12');
  // 09:00 in Cairo on 11 January
  const now = new Date('2024-01-11T07:00:00Z');

  const first = await runTick(now);
  const afterFirst = [...(await remindersOf(morning.id)), ...(await remindersOf(evening.id))];
  expect(afterFirst.map((row) => row.reminderTime.toISOString())).toEqual([
    '2024-01-11T06:00:00.000Z',
    '2024-01-10T18:00:00.000Z',
  ]);
  expect(first.generated).toBeGreaterThanOrEqual(2);

  const second = await runTick(now);
  expect(second.generated).toBe(0);
  const afterSecond = [...(await remindersOf(morning.id)), ...(await remindersOf(evening.id))];
  expect(afterSecond).toEqual(afterFirst);
  for (const reminder of afterSecond) {
    expect(reminder).toMatchObject({ status: 'SENT', sentAt: now });
    expect(pushesFor(reminder.id)).toHaveLength(1);
  }
});

test('after missed ticks the next tick catches up the last 24 hours only', async () => {
  const { medicine, device } = await patientWithDevice();
  const morning = await dailyAt(medicine.id, '08:00', '2024-02-04', '2024-02-29');
  const evening = await dailyAt(medicine.id, '20:00', '2024-02-04', '2024-02-29');
  const target = { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth };

  // The last tick ran at 07:00 in Cairo on 4 February, before the first dose
  await runTick(new Date('2024-02-04T05:00:00Z'));
  expect(await remindersOf(morning.id)).toEqual([]);
  expect(await remindersOf(evening.id)).toEqual([]);

  // No tick ran again until 19:30 on 5 February, so 08:00 on 4 February is more than a day old
  const now = new Date('2024-02-05T17:30:00Z');
  await runTick(now);
  const [morningDose, ...otherMornings] = await remindersOf(morning.id);
  const [eveningDose, ...otherEvenings] = await remindersOf(evening.id);
  expect(otherMornings).toEqual([]);
  expect(otherEvenings).toEqual([]);
  expect(morningDose).toMatchObject({
    reminderTime: new Date('2024-02-05T06:00:00Z'),
    status: 'SENT',
    sentAt: now,
  });
  expect(eveningDose).toMatchObject({
    reminderTime: new Date('2024-02-04T18:00:00Z'),
    status: 'SENT',
    sentAt: now,
  });

  // NIR2 each push names the medicine, its dose and the local time
  expect(pushesFor(morningDose.id)).toEqual([
    [
      target,
      {
        reminderId: morningDose.id,
        title: 'Testamol',
        body: '500 mg due at 08:00',
        url: `/doses/${morningDose.id}`,
      },
    ],
  ]);
  expect(pushesFor(eveningDose.id)).toEqual([
    [
      target,
      {
        reminderId: eveningDose.id,
        title: 'Testamol',
        body: '500 mg due at 20:00',
        url: `/doses/${eveningDose.id}`,
      },
    ],
  ]);

  // Each next dose is still to come, so neither is missed yet
  expect(await logsOf(morningDose.id)).toEqual([]);
  expect(await logsOf(eveningDose.id)).toEqual([]);
});

test('two ticks at once send each reminder once', async () => {
  const { medicine } = await patientWithDevice();
  const schedules = [];
  for (const time of ['08:00', '08:10', '08:20']) {
    schedules.push(await dailyAt(medicine.id, time, '2024-03-04'));
  }
  // 08:30 in Cairo on 4 March, after all three doses
  const now = new Date('2024-03-04T06:30:00Z');

  await Promise.all([runTick(now), runTick(now)]);
  for (const schedule of schedules) {
    const reminders = await remindersOf(schedule.id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ status: 'SENT', sentAt: now });
    expect(pushesFor(reminders[0].id)).toHaveLength(1);
  }
});

test('UC6 an unanswered dose is missed once the next dose is due, and an answered one stays', async () => {
  const { medicine } = await patientWithDevice();
  const unanswered = await dailyAt(medicine.id, '08:00', '2024-03-11', '2024-03-20');
  const answered = await dailyAt(medicine.id, '08:00', '2024-03-11', '2024-03-20');
  const lastDay = await dailyAt(medicine.id, '08:00', '2024-03-11');

  // 08:00 in Cairo on 11 March
  await runTick(new Date('2024-03-11T06:00:00Z'));
  const [firstDose] = await remindersOf(unanswered.id);
  const [answeredDose] = await remindersOf(answered.id);
  const [lastDose] = await remindersOf(lastDay.id);

  // The patient answers Taken, saved the way the dose route saves it
  await prisma.$transaction([
    prisma.doseLog.create({
      data: {
        scheduleId: answered.id,
        reminderId: answeredDose.id,
        status: 'TAKEN',
        date: new Date('2024-03-11'),
        time: '08:00',
      },
    }),
    prisma.reminder.update({ where: { id: answeredDose.id }, data: { status: 'RESOLVED' } }),
  ]);

  // 22:00 the same day, before the next dose
  await runTick(new Date('2024-03-11T20:00:00Z'));
  expect(await storedReminder(firstDose.id)).toMatchObject({ status: 'SENT' });
  expect(await logsOf(firstDose.id)).toEqual([]);
  expect(await logsOf(lastDose.id)).toEqual([]);

  // 08:00 the next day, when the next dose is due; a second tick changes nothing
  const nextDay = new Date('2024-03-12T06:00:00Z');
  await runTick(nextDay);
  await runTick(nextDay);

  const missedLog = { status: 'MISSED', date: new Date('2024-03-11'), time: '08:00' };
  expect(await logsOf(firstDose.id)).toEqual([{ scheduleId: unanswered.id, ...missedLog }]);
  expect(await storedReminder(firstDose.id)).toMatchObject({ status: 'RESOLVED' });
  expect(await logsOf(answeredDose.id)).toEqual([
    { scheduleId: answered.id, status: 'TAKEN', date: new Date('2024-03-11'), time: '08:00' },
  ]);
  expect(await storedReminder(answeredDose.id)).toMatchObject({ status: 'RESOLVED' });

  // The last dose of a schedule that ended is missed when its next dose would have been due
  expect(await logsOf(lastDose.id)).toEqual([{ scheduleId: lastDay.id, ...missedLog }]);
  expect(await remindersOf(lastDay.id)).toHaveLength(1);

  // The new day's dose is sent and waits for an answer
  const [, secondDose, ...rest] = await remindersOf(unanswered.id);
  expect(rest).toEqual([]);
  expect(secondDose).toMatchObject({ reminderTime: nextDay, status: 'SENT', sentAt: nextDay });
  expect(await logsOf(secondDose.id)).toEqual([]);
});

test('a dose time moved later gets no reminder for the day before the change', async () => {
  const { medicine } = await patientWithDevice();
  const schedule = await dailyAt(medicine.id, '08:00', '2024-04-01', '2024-04-10');
  const morningTime = new Date('2024-04-02T06:00:00Z');

  // 08:00 in Cairo on 2 April, so that dose is sent
  await runTick(morningTime);
  const [morningDose] = await remindersOf(schedule.id);
  expect(morningDose).toMatchObject({ reminderTime: morningTime, status: 'SENT' });

  // At 10:00 the patient moves the time to 21:30; the test sets the save time by hand
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { time: '21:30', updatedAt: new Date('2024-04-02T08:00:00Z') },
  });

  // 21:30 on 1 April is within the last 24 hours, but it was never a dose
  await runTick(new Date('2024-04-02T08:01:00Z'));
  const afterChange = await remindersOf(schedule.id);
  expect(afterChange.map((row) => row.reminderTime)).toEqual([morningTime]);
  expect(pushesFor(morningDose.id)).toHaveLength(1);

  // 21:30 on 2 April: the new time is sent and the open 08:00 dose is missed
  const eveningTime = new Date('2024-04-02T19:30:00Z');
  await runTick(eveningTime);
  const afterEvening = await remindersOf(schedule.id);
  expect(afterEvening.map((row) => row.reminderTime)).toEqual([morningTime, eveningTime]);
  expect(await logsOf(morningDose.id)).toEqual([
    { scheduleId: schedule.id, status: 'MISSED', date: new Date('2024-04-02'), time: '08:00' },
  ]);
});

test('FR10 a dose time already past today when it is added starts tomorrow', async () => {
  const { medicine } = await patientWithDevice();
  // 08:00 from 15 January, added at 14:00 in Cairo that day, which is 12:00 UTC
  const schedule = await createSchedule(medicine.id, {
    time: '08:00',
    startDate: new Date('2024-01-15'),
    endDate: new Date('2024-01-16'),
    updatedAt: new Date('2024-01-15T12:00:00Z'),
  });

  // The next tick at 14:01 and a late one at 23:59 make nothing for the 08:00 that had passed
  await runTick(new Date('2024-01-15T12:01:00Z'));
  await runTick(new Date('2024-01-15T21:59:00Z'));
  expect(await remindersOf(schedule.id)).toEqual([]);

  // 08:00 the next day
  const nextMorning = new Date('2024-01-16T06:00:00Z');
  await runTick(nextMorning);
  const [dose, ...rest] = await remindersOf(schedule.id);
  expect(rest).toEqual([]);
  expect(dose).toMatchObject({ reminderTime: nextMorning, status: 'SENT', sentAt: nextMorning });
  expect(pushesFor(dose.id)).toHaveLength(1);
});

test('FR10 a dose time still to come today when it is added is due today', async () => {
  const { medicine } = await patientWithDevice();
  // 16:00 on 18 January, added at 14:00 in Cairo that day, which is 12:00 UTC
  const schedule = await createSchedule(medicine.id, {
    time: '16:00',
    startDate: new Date('2024-01-18'),
    endDate: new Date('2024-01-18'),
    updatedAt: new Date('2024-01-18T12:00:00Z'),
  });

  await runTick(new Date('2024-01-18T12:01:00Z'));
  expect(await remindersOf(schedule.id)).toEqual([]);

  // 16:00 that day
  const doseTime = new Date('2024-01-18T14:00:00Z');
  await runTick(doseTime);
  const [dose, ...rest] = await remindersOf(schedule.id);
  expect(rest).toEqual([]);
  expect(dose).toMatchObject({ reminderTime: doseTime, status: 'SENT', sentAt: doseTime });
  expect(pushesFor(dose.id)).toHaveLength(1);
});

test('FR10 a dose time changed to a time already past today starts tomorrow', async () => {
  const { medicine } = await patientWithDevice();
  const schedule = await dailyAt(medicine.id, '20:00', '2024-01-24', '2024-01-25');

  // At 14:00 in Cairo on 24 January, 12:00 UTC, the patient changes 20:00 to 09:00
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { time: '09:00', updatedAt: new Date('2024-01-24T12:00:00Z') },
  });

  // Ticks at 14:01 and 20:00 that day make no 09:00 dose and no dose at the old time
  await runTick(new Date('2024-01-24T12:01:00Z'));
  await runTick(new Date('2024-01-24T18:00:00Z'));
  expect(await remindersOf(schedule.id)).toEqual([]);

  // 09:00 the next day
  const nextMorning = new Date('2024-01-25T07:00:00Z');
  await runTick(nextMorning);
  const [dose, ...rest] = await remindersOf(schedule.id);
  expect(rest).toEqual([]);
  expect(dose).toMatchObject({ reminderTime: nextMorning, status: 'SENT', sentAt: nextMorning });
  expect(pushesFor(dose.id)).toHaveLength(1);
});

test('UC6 an open dose is missed once the changed time has passed that day, and the new time starts tomorrow', async () => {
  const { medicine } = await patientWithDevice();
  const schedule = await dailyAt(medicine.id, '08:00', '2024-01-24', '2024-01-25');
  const morningTime = new Date('2024-01-24T06:00:00Z');

  // 08:00 in Cairo on 24 January, so that dose is sent and left unanswered
  await runTick(morningTime);
  const [morningDose] = await remindersOf(schedule.id);
  expect(morningDose).toMatchObject({ reminderTime: morningTime, status: 'SENT' });

  // At 14:00 in Cairo, 12:00 UTC, the patient changes 08:00 to 09:00
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { time: '09:00', updatedAt: new Date('2024-01-24T12:00:00Z') },
  });

  // The 14:01 tick makes no 09:00 dose for 24 January
  await runTick(new Date('2024-01-24T12:01:00Z'));
  const afterChange = await remindersOf(schedule.id);
  expect(afterChange.map((row) => row.reminderTime)).toEqual([morningTime]);

  // Yet 09:00 that day is the next dose after 08:00, so the open dose is missed
  expect(await logsOf(morningDose.id)).toEqual([
    { scheduleId: schedule.id, status: 'MISSED', date: new Date('2024-01-24'), time: '08:00' },
  ]);
  expect(await storedReminder(morningDose.id)).toMatchObject({ status: 'RESOLVED' });

  // 09:00 the next day gets the first reminder at the new time; a second tick adds nothing
  const nextMorning = new Date('2024-01-25T07:00:00Z');
  await runTick(nextMorning);
  await runTick(nextMorning);
  const reminders = await remindersOf(schedule.id);
  expect(reminders.map((row) => row.reminderTime)).toEqual([morningTime, nextMorning]);
  const [, dose] = reminders;
  expect(dose).toMatchObject({ status: 'SENT', sentAt: nextMorning });
  expect(pushesFor(dose.id)).toHaveLength(1);
  expect(await logsOf(dose.id)).toEqual([]);
});

test('FR10 after skipped ticks the next tick creates every dose since the save, each once', async () => {
  const { medicine } = await patientWithDevice();
  // Both added at 14:00 in Cairo on 28 March, 12:00 UTC, for that day only
  const added = {
    startDate: new Date('2024-03-28'),
    endDate: new Date('2024-03-28'),
    updatedAt: new Date('2024-03-28T12:00:00Z'),
  };
  const first = await createSchedule(medicine.id, { time: '14:05', ...added });
  const second = await createSchedule(medicine.id, { time: '14:15', ...added });

  // No tick ran until 14:20, and one more a minute later adds nothing
  const now = new Date('2024-03-28T12:20:00Z');
  await runTick(now);
  await runTick(new Date('2024-03-28T12:21:00Z'));
  const doses = [
    [first, new Date('2024-03-28T12:05:00Z')],
    [second, new Date('2024-03-28T12:15:00Z')],
  ];
  for (const [schedule, doseTime] of doses) {
    const reminders = await remindersOf(schedule.id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ reminderTime: doseTime, status: 'SENT', sentAt: now });
    expect(pushesFor(reminders[0].id)).toHaveLength(1);
  }
});

test('a snoozed reminder is not sent before the snooze ends and is sent after it', async () => {
  const { medicine } = await patientWithDevice();
  const schedule = await dailyAt(medicine.id, '08:00', '2024-03-18');
  const doseTime = new Date('2024-03-18T06:00:00Z');
  const snoozeEnd = new Date('2024-03-18T06:12:00Z');
  // Sent at 08:00 in Cairo, then snoozed for 10 minutes at 08:02
  const reminder = await createReminder(schedule.id, {
    reminderTime: doseTime,
    status: 'PENDING',
    sentAt: doseTime,
    snoozedUntil: snoozeEnd,
  });

  await runTick(new Date('2024-03-18T06:05:00Z'));
  expect(pushesFor(reminder.id)).toEqual([]);
  expect(await storedReminder(reminder.id)).toMatchObject({ status: 'PENDING', sentAt: doseTime });

  await runTick(snoozeEnd);
  expect(pushesFor(reminder.id)).toHaveLength(1);
  expect(await storedReminder(reminder.id)).toMatchObject({ status: 'SENT', sentAt: snoozeEnd });
  expect(await remindersOf(schedule.id)).toHaveLength(1);
});

test('a suspended patient gets no reminders', async () => {
  const active = await patientWithDevice();
  const suspended = await patientWithDevice();
  await prisma.user.update({ where: { id: suspended.user.id }, data: { status: 'SUSPENDED' } });
  const activeSchedule = await dailyAt(active.medicine.id, '08:00', '2024-03-25');
  const suspendedSchedule = await dailyAt(suspended.medicine.id, '08:00', '2024-03-25');

  await runTick(new Date('2024-03-25T06:30:00Z'));
  expect(await remindersOf(activeSchedule.id)).toHaveLength(1);
  expect(pushesTo(active.device)).toHaveLength(1);
  expect(await remindersOf(suspendedSchedule.id)).toEqual([]);
  expect(pushesTo(suspended.device)).toEqual([]);
});

test('a failed push is logged without patient data and the other reminders still go out', async () => {
  const failing = await patientWithDevice();
  const gone = await patientWithDevice();
  const working = await patientWithDevice();
  const patients = [failing, gone, working];
  const schedules = [];
  for (const patient of patients) {
    schedules.push(await dailyAt(patient.medicine.id, '08:00', '2024-01-22'));
  }
  sendPush.mockImplementation(async (target) => {
    if (target.endpoint === failing.device.endpoint) return { ok: false };
    // sendPush has already removed a device that is gone, so it is not a failure to log
    if (target.endpoint === gone.device.endpoint) return { ok: false, gone: true };
    return { ok: true };
  });

  await runTick(new Date('2024-01-22T06:30:00Z'));
  for (const schedule of schedules) {
    const [reminder] = await remindersOf(schedule.id);
    expect(reminder).toMatchObject({ status: 'SENT' });
    expect(pushesFor(reminder.id)).toHaveLength(1);
  }
  const events = await prisma.systemEvent.findMany({
    where: { type: 'PUSH_FAILED', userId: { in: patients.map((patient) => patient.user.id) } },
    select: { userId: true, message: true },
  });
  expect(events).toEqual([{ userId: failing.user.id, message: PUSH_FAILED_MESSAGE }]);
});

test('a step that fails is logged as TICK_FAILED and the tick still finishes', async () => {
  const { medicine } = await patientWithDevice();
  // A time the forms never allow, written straight to the database
  const broken = await dailyAt(medicine.id, '25:00', '2024-01-29');
  const good = await dailyAt(medicine.id, '08:00', '2024-01-29');
  const waiting = await createReminder(good.id, {
    reminderTime: new Date('2024-01-29T06:00:00Z'),
    status: 'PENDING',
    sentAt: null,
  });
  const lastEvent = await prisma.systemEvent.findFirst({ orderBy: { id: 'desc' } });

  try {
    const result = await runTick(new Date('2024-01-29T06:30:00Z'));
    expect(result).toEqual({ generated: 0, sent: expect.any(Number), missed: expect.any(Number) });
    const events = await prisma.systemEvent.findMany({
      where: { type: 'TICK_FAILED', id: { gt: lastEvent?.id ?? 0 } },
      select: { userId: true, message: true },
    });
    expect(events).toEqual([
      { userId: null, message: 'The tick stopped while creating reminders (RangeError).' },
    ]);
    // The send step still ran after the failed step
    expect(await storedReminder(waiting.id)).toMatchObject({ status: 'SENT' });
    expect(pushesFor(waiting.id)).toHaveLength(1);
  } finally {
    await prisma.schedule.delete({ where: { id: broken.id } });
  }
});
