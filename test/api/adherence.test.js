import { afterAll, expect, test } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getHistory, getTotals } from '@/services/adherence';
import { createMedicine, createPatient, createReminder, createSchedule } from '../helpers';

const MORNING = { name: 'Morning Tablet', dosage: '250 mg' };
const NIGHT = { name: 'Night Syrup', dosage: '5 mL' };
const NO_TOTALS = { taken: 0, missed: 0, skipped: 0, rate: null };

afterAll(async () => {
  await prisma.$disconnect();
});

// A medicine with one daily schedule; each test adds the logs it needs
async function scheduleFor(userId, medicine) {
  const { id } = await createMedicine(userId, medicine);
  return createSchedule(id, { startDate: new Date('2026-03-01') });
}

// An answered dose, written straight to the database as the answer route would
async function loggedDose(scheduleId, status, date, time = '08:00') {
  // Any instant works, as long as each dose of a schedule has its own
  const reminder = await createReminder(scheduleId, {
    reminderTime: new Date(`${date}T${time}:00.000Z`),
    status: 'RESOLVED',
  });
  return prisma.doseLog.create({
    data: { scheduleId, reminderId: reminder.id, status, date: new Date(date), time },
  });
}

// Many answered doses at 08:00 on days in a row from 1 March 2026, the logs in one createMany
async function loggedDoses(scheduleId, statuses) {
  // Each log needs its own reminder, so those are made first
  const reminders = await prisma.reminder.createManyAndReturn({
    data: statuses.map((_, index) => ({
      scheduleId,
      reminderTime: new Date(Date.UTC(2026, 2, 1 + index, 8)),
      status: 'RESOLVED',
    })),
  });
  return prisma.doseLog.createMany({
    data: reminders.map((reminder, index) => ({
      scheduleId,
      reminderId: reminder.id,
      status: statuses[index],
      date: new Date(reminder.reminderTime.toISOString().slice(0, 10)),
      time: '08:00',
    })),
  });
}

// What the history should hold for one log
function shown(log, medicine, date) {
  return {
    id: log.id,
    medicineName: medicine.name,
    dosage: medicine.dosage,
    date,
    time: log.time,
    status: log.status,
  };
}

test('a new patient has zero totals, no rate and an empty history', async () => {
  const { user } = await createPatient();

  expect(await getTotals(user.id)).toEqual(NO_TOTALS);
  expect(await getHistory(user.id)).toEqual([]);
});

test('the rate counts skipped doses: 3 taken, 1 missed and 1 skipped give 60', async () => {
  const { user } = await createPatient();
  const schedule = await scheduleFor(user.id, MORNING);
  const statuses = ['TAKEN', 'MISSED', 'TAKEN', 'SKIPPED', 'TAKEN'];
  for (const [index, status] of statuses.entries()) {
    await loggedDose(schedule.id, status, `2026-03-1${index}`);
  }

  expect(await getTotals(user.id)).toEqual({ taken: 3, missed: 1, skipped: 1, rate: 60 });
});

test('the rate is rounded down to a whole percent', async () => {
  const first = await createPatient();
  const firstSchedule = await scheduleFor(first.user.id, MORNING);
  // 2 of 3 is 66.7%, rounded down to 66
  for (const [index, status] of ['TAKEN', 'TAKEN', 'SKIPPED'].entries()) {
    await loggedDose(firstSchedule.id, status, `2026-03-1${index}`);
  }
  const second = await createPatient();
  const secondSchedule = await scheduleFor(second.user.id, MORNING);
  // 1 of 3 is 33.3%, rounded down to 33
  for (const [index, status] of ['TAKEN', 'MISSED', 'MISSED'].entries()) {
    await loggedDose(secondSchedule.id, status, `2026-03-1${index}`);
  }

  expect(await getTotals(first.user.id)).toEqual({ taken: 2, missed: 0, skipped: 1, rate: 66 });
  expect(await getTotals(second.user.id)).toEqual({ taken: 1, missed: 2, skipped: 0, rate: 33 });
});

test('the rate is 100 only when every logged dose was taken: 200 of 201 give 99', async () => {
  const oneMissed = await createPatient();
  const oneMissedSchedule = await scheduleFor(oneMissed.user.id, MORNING);
  // 200 of 201 is 99.5%, which rounding to the nearest would show as 100
  await loggedDoses(oneMissedSchedule.id, ['MISSED', ...Array(200).fill('TAKEN')]);
  const allTaken = await createPatient();
  const allTakenSchedule = await scheduleFor(allTaken.user.id, MORNING);
  await loggedDoses(allTakenSchedule.id, Array(201).fill('TAKEN'));

  expect(await getTotals(oneMissed.user.id)).toEqual({
    taken: 200,
    missed: 1,
    skipped: 0,
    rate: 99,
  });
  expect(await getTotals(allTaken.user.id)).toEqual({
    taken: 201,
    missed: 0,
    skipped: 0,
    rate: 100,
  });
});

test('the rate is worked out in whole numbers: 29 taken of 100 give 29', async () => {
  const { user } = await createPatient();
  const schedule = await scheduleFor(user.id, MORNING);
  // (29 / 100) * 100 is 28.999... in JavaScript, which would round down to 28
  await loggedDoses(schedule.id, [...Array(29).fill('TAKEN'), ...Array(71).fill('SKIPPED')]);

  expect(await getTotals(user.id)).toEqual({ taken: 29, missed: 0, skipped: 71, rate: 29 });
});

test('the rate stays null while a patient with dose times has no logs', async () => {
  const { user } = await createPatient();
  await scheduleFor(user.id, MORNING);

  expect(await getTotals(user.id)).toEqual(NO_TOTALS);
});

test('the history is newest first by date, then time, then id', async () => {
  const { user } = await createPatient();
  const morning = await scheduleFor(user.id, MORNING);
  const night = await scheduleFor(user.id, NIGHT);
  const first = await loggedDose(morning.id, 'TAKEN', '2026-03-10', '08:00');
  const second = await loggedDose(night.id, 'MISSED', '2026-03-10', '21:00');
  const third = await loggedDose(morning.id, 'SKIPPED', '2026-03-11', '08:00');
  const fourth = await loggedDose(night.id, 'TAKEN', '2026-03-09', '21:00');
  // Same date and time on two medicines: the later log comes first
  const fifth = await loggedDose(morning.id, 'TAKEN', '2026-03-12', '08:00');
  const sixth = await loggedDose(night.id, 'TAKEN', '2026-03-12', '08:00');

  const history = await getHistory(user.id);
  expect(history).toEqual([
    shown(sixth, NIGHT, '2026-03-12'),
    shown(fifth, MORNING, '2026-03-12'),
    shown(third, MORNING, '2026-03-11'),
    shown(second, NIGHT, '2026-03-10'),
    shown(first, MORNING, '2026-03-10'),
    shown(fourth, NIGHT, '2026-03-09'),
  ]);
  expect(await getHistory(user.id, 2)).toEqual(history.slice(0, 2));
});

test('the logs of another patient never change my totals or my history', async () => {
  const me = await createPatient();
  const mySchedule = await scheduleFor(me.user.id, MORNING);
  const myLog = await loggedDose(mySchedule.id, 'TAKEN', '2026-03-10');
  const other = await createPatient();
  const otherSchedule = await scheduleFor(other.user.id, NIGHT);
  // Newer than mine, so a leak would sit at the top of my history
  const otherLogs = [
    await loggedDose(otherSchedule.id, 'MISSED', '2026-03-11'),
    await loggedDose(otherSchedule.id, 'MISSED', '2026-03-12'),
    await loggedDose(otherSchedule.id, 'SKIPPED', '2026-03-13'),
  ];

  expect(await getTotals(me.user.id)).toEqual({ taken: 1, missed: 0, skipped: 0, rate: 100 });
  expect(await getHistory(me.user.id)).toEqual([shown(myLog, MORNING, '2026-03-10')]);

  expect(await getTotals(other.user.id)).toEqual({ taken: 0, missed: 2, skipped: 1, rate: 0 });
  expect(await getHistory(other.user.id)).toEqual([
    shown(otherLogs[2], NIGHT, '2026-03-13'),
    shown(otherLogs[1], NIGHT, '2026-03-12'),
    shown(otherLogs[0], NIGHT, '2026-03-11'),
  ]);
});
