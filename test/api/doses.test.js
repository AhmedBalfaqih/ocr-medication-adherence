import { afterAll, expect, test } from 'vitest';
import { GET as listRoute } from '@/app/api/doses/route';
import { GET as readRoute, POST as answerRoute } from '@/app/api/doses/[reminderId]/route';
import { POST as snoozeRoute } from '@/app/api/doses/[reminderId]/snooze/route';
import { prisma } from '@/lib/prisma';
import { localDateTime } from '@/lib/time';
import {
  createMedicine,
  createPatient,
  createReminder,
  createSchedule,
  loginAs,
  makeRequest,
  withParams,
} from '../helpers';

// New patients get the default zone
const CAIRO = 'Africa/Cairo';
const OTHER_ORIGIN = 'https://other-site.example';
const MINUTE = 60 * 1000;
// 10 March 2026 at 08:00 in Cairo, before the clock change in April
const MARCH_DOSE = new Date('2026-03-10T06:00:00.000Z');

const DOSE_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Dose not found.' } };
const BAD_ID = { error: { code: 'NOT_FOUND', message: 'Not found.' } };
const ALREADY_RECORDED = {
  error: { code: 'ALREADY_RECORDED', message: 'This dose is already recorded.' },
};
const STATUS_MISSING = {
  error: { code: 'VALIDATION', message: 'Please choose Taken, Skipped or Missed.' },
};
const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };
const BAD_ORIGIN = { error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' } };

afterAll(async () => {
  await prisma.$disconnect();
});

function listDoses(cookie) {
  return listRoute(makeRequest('/api/doses', { cookie }));
}

function readDose(id, cookie) {
  return readRoute(
    makeRequest(`/api/doses/${id}`, { cookie }),
    withParams({ reminderId: String(id) }),
  );
}

function answerDose(id, body, cookie, origin) {
  return answerRoute(
    makeRequest(`/api/doses/${id}`, { method: 'POST', body, cookie, origin }),
    withParams({ reminderId: String(id) }),
  );
}

// The screens send {} as the body, so the JSON check passes
function snoozeDose(id, cookie, origin) {
  return snoozeRoute(
    makeRequest(`/api/doses/${id}/snooze`, { method: 'POST', body: {}, cookie, origin }),
    withParams({ reminderId: String(id) }),
  );
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

// A medicine with a daily schedule; each test adds the reminders it needs
async function scheduleFor(userId, medicineFields = {}) {
  const medicine = await createMedicine(userId, medicineFields);
  return createSchedule(medicine.id, { startDate: new Date('2026-03-01') });
}

// A dose that already has an answer, written straight to the database as the tick would
async function answeredDose(scheduleId, status, reminderTime) {
  const reminder = await createReminder(scheduleId, { reminderTime, status: 'RESOLVED' });
  const { date, time } = localDateTime(reminderTime, CAIRO);
  await prisma.doseLog.create({
    data: { scheduleId, reminderId: reminder.id, status, date: new Date(date), time },
  });
  return reminder;
}

function storedReminder(id) {
  return prisma.reminder.findUnique({ where: { id } });
}

function storedLog(reminderId) {
  return prisma.doseLog.findUnique({ where: { reminderId } });
}

test('the due list holds only my doses that are due now, newest first', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id, { name: 'Due Tablet', dosage: '250 mg' });
  const now = Date.now();
  const sent = await createReminder(schedule.id, { reminderTime: new Date(now - 120 * MINUTE) });
  const waiting = await createReminder(schedule.id, {
    reminderTime: new Date(now - 60 * MINUTE),
    status: 'PENDING',
    sentAt: null,
  });
  const snoozeOver = await createReminder(schedule.id, {
    reminderTime: new Date(now - 300 * MINUTE),
    status: 'PENDING',
    snoozedUntil: new Date(now - MINUTE),
  });
  // Not due now: later today, still snoozed, or already answered
  await createReminder(schedule.id, {
    reminderTime: new Date(now + 60 * MINUTE),
    status: 'PENDING',
    sentAt: null,
  });
  await createReminder(schedule.id, {
    reminderTime: new Date(now - 240 * MINUTE),
    status: 'PENDING',
    snoozedUntil: new Date(now + 5 * MINUTE),
  });
  await answeredDose(schedule.id, 'TAKEN', new Date(now - 180 * MINUTE));

  const other = await loggedInPatient();
  const otherSchedule = await scheduleFor(other.user.id, { name: 'Other Tablet' });
  const otherDose = await createReminder(otherSchedule.id);

  const response = await listDoses(cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    [waiting, sent, snoozeOver].map((reminder) => ({
      reminderId: reminder.id,
      medicineName: 'Due Tablet',
      dosage: '250 mg',
      ...localDateTime(reminder.reminderTime, CAIRO),
    })),
  );

  const otherResponse = await listDoses(other.cookie);
  expect(await otherResponse.json()).toEqual([
    {
      reminderId: otherDose.id,
      medicineName: 'Other Tablet',
      dosage: '500 mg',
      ...localDateTime(otherDose.reminderTime, CAIRO),
    },
  ]);
});

test('a dose shows its medicine and its local date and time, with no answer yet', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id, { name: 'Morning Syrup', dosage: '5 mL' });
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  const response = await readDose(reminder.id, cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reminderId: reminder.id,
    medicineName: 'Morning Syrup',
    dosage: '5 mL',
    date: '2026-03-10',
    time: '08:00',
    status: 'SENT',
    answer: null,
  });
});

test('the date and time follow the patient zone, even across midnight UTC', async () => {
  const { user, cookie } = await loggedInPatient();
  await prisma.user.update({ where: { id: user.id }, data: { timezone: 'Asia/Tokyo' } });
  const schedule = await scheduleFor(user.id);
  // 23:30 UTC on 10 March is 08:30 on 11 March in Tokyo
  const reminder = await createReminder(schedule.id, {
    reminderTime: new Date('2026-03-10T23:30:00.000Z'),
  });

  const read = await readDose(reminder.id, cookie);
  expect(await read.json()).toMatchObject({ date: '2026-03-11', time: '08:30' });

  const answer = await answerDose(reminder.id, { status: 'TAKEN' }, cookie);
  expect(answer.status).toBe(201);
  expect(await storedLog(reminder.id)).toMatchObject({
    date: new Date('2026-03-11'),
    time: '08:30',
  });
});

test('answering a dose saves one log with the dose time and returns the totals', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  const response = await answerDose(reminder.id, { status: 'TAKEN' }, cookie);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    status: 'TAKEN',
    totals: { taken: 1, missed: 0, skipped: 0, rate: 100 },
  });

  expect(await storedLog(reminder.id)).toMatchObject({
    scheduleId: schedule.id,
    status: 'TAKEN',
    date: new Date('2026-03-10'),
    time: '08:00',
  });
  expect(await storedReminder(reminder.id)).toEqual({ ...reminder, status: 'RESOLVED' });

  const read = await readDose(reminder.id, cookie);
  expect(await read.json()).toMatchObject({ status: 'RESOLVED', answer: 'TAKEN' });
  expect(await (await listDoses(cookie)).json()).toEqual([]);
});

test('the totals count each answer of this patient and nobody else', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const now = Date.now();
  const reminders = [];
  for (const hoursAgo of [3, 2, 1]) {
    reminders.push(
      await createReminder(schedule.id, { reminderTime: new Date(now - hoursAgo * 60 * MINUTE) }),
    );
  }
  const other = await createPatient();
  const otherSchedule = await scheduleFor(other.user.id);
  await answeredDose(otherSchedule.id, 'TAKEN', MARCH_DOSE);

  const totals = [];
  for (const [index, status] of ['TAKEN', 'SKIPPED', 'MISSED'].entries()) {
    const response = await answerDose(reminders[index].id, { status }, cookie);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.status).toBe(status);
    totals.push(body.totals);
  }
  expect(totals).toEqual([
    { taken: 1, missed: 0, skipped: 0, rate: 100 },
    { taken: 1, missed: 0, skipped: 1, rate: 50 },
    { taken: 1, missed: 1, skipped: 1, rate: 33 },
  ]);
});

test('a second answer gets 409 and the first answer stays', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  const first = await answerDose(reminder.id, { status: 'SKIPPED' }, cookie);
  expect(first.status).toBe(201);
  const log = await storedLog(reminder.id);

  for (const status of ['TAKEN', 'SKIPPED', 'MISSED']) {
    const response = await answerDose(reminder.id, { status }, cookie);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(ALREADY_RECORDED);
  }
  expect(await storedLog(reminder.id)).toEqual(log);
});

test('a missed dose from the tick can be marked taken, but only once', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await answeredDose(schedule.id, 'MISSED', MARCH_DOSE);
  const missed = await storedLog(reminder.id);

  const response = await answerDose(reminder.id, { status: 'TAKEN' }, cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: 'TAKEN',
    totals: { taken: 1, missed: 0, skipped: 0, rate: 100 },
  });
  const taken = await storedLog(reminder.id);
  expect(taken).toMatchObject({
    id: missed.id,
    status: 'TAKEN',
    date: missed.date,
    time: missed.time,
  });

  for (const status of ['TAKEN', 'SKIPPED', 'MISSED']) {
    const again = await answerDose(reminder.id, { status }, cookie);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual(ALREADY_RECORDED);
  }
  expect(await storedLog(reminder.id)).toEqual(taken);
});

test('a missed dose cannot be changed to skipped', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await answeredDose(schedule.id, 'MISSED', MARCH_DOSE);
  const missed = await storedLog(reminder.id);

  for (const status of ['SKIPPED', 'MISSED']) {
    const response = await answerDose(reminder.id, { status }, cookie);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(ALREADY_RECORDED);
  }
  expect(await storedLog(reminder.id)).toEqual(missed);
});

test('a taken dose cannot be replaced', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await answeredDose(schedule.id, 'TAKEN', MARCH_DOSE);
  const taken = await storedLog(reminder.id);

  for (const status of ['MISSED', 'SKIPPED', 'TAKEN']) {
    const response = await answerDose(reminder.id, { status }, cookie);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(ALREADY_RECORDED);
  }
  expect(await storedLog(reminder.id)).toEqual(taken);
});

test('two answers at the same moment save one log', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  const responses = await Promise.all([
    answerDose(reminder.id, { status: 'TAKEN' }, cookie),
    answerDose(reminder.id, { status: 'SKIPPED' }, cookie),
  ]);
  expect(responses.map((response) => response.status).toSorted()).toEqual([201, 409]);
  const refused = responses.find((response) => response.status === 409);
  expect(await refused.json()).toEqual(ALREADY_RECORDED);
  expect(await prisma.doseLog.count({ where: { reminderId: reminder.id } })).toBe(1);
});

test('an answer that is not Taken, Skipped or Missed gets 400 and saves nothing', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  for (const body of [{ status: 'LATER' }, { status: 'taken' }, {}]) {
    const response = await answerDose(reminder.id, body, cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(STATUS_MISSING);
  }
  expect(await storedLog(reminder.id)).toBeNull();
  expect(await storedReminder(reminder.id)).toEqual(reminder);
});

test('another patient gets 404 on my dose to read, answer or snooze', async () => {
  const owner = await createPatient();
  const schedule = await scheduleFor(owner.user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });
  const stranger = await loggedInPatient();

  const responses = [
    await readDose(reminder.id, stranger.cookie),
    await answerDose(reminder.id, { status: 'TAKEN' }, stranger.cookie),
    await snoozeDose(reminder.id, stranger.cookie),
  ];
  for (const response of responses) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(DOSE_NOT_FOUND);
  }
  expect(await storedReminder(reminder.id)).toEqual(reminder);
  expect(await storedLog(reminder.id)).toBeNull();
});

test('a dose id that is not a number or does not exist gets 404', async () => {
  const { cookie } = await loggedInPatient();

  const badIds = [
    await readDose('abc', cookie),
    await answerDose('abc', { status: 'TAKEN' }, cookie),
    await snoozeDose('abc', cookie),
  ];
  for (const response of badIds) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(BAD_ID);
  }

  const missing = [
    await readDose(2147483647, cookie),
    await answerDose(2147483647, { status: 'TAKEN' }, cookie),
    await snoozeDose(2147483647, cookie),
  ];
  for (const response of missing) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(DOSE_NOT_FOUND);
  }
});

test('snooze moves the reminder ten minutes on and keeps the dose time', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, {
    reminderTime: new Date(Date.now() - 5 * MINUTE),
  });

  const before = Date.now();
  const response = await snoozeDose(reminder.id, cookie);
  const after = Date.now();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ snoozedUntil: expect.any(String) });
  const snoozedUntil = new Date(body.snoozedUntil);
  expect(snoozedUntil.getTime()).toBeGreaterThanOrEqual(before + 10 * MINUTE);
  expect(snoozedUntil.getTime()).toBeLessThanOrEqual(after + 10 * MINUTE);

  expect(await storedReminder(reminder.id)).toEqual({
    ...reminder,
    status: 'PENDING',
    snoozedUntil,
  });
  expect(await (await listDoses(cookie)).json()).toEqual([]);
});

test('an answered dose cannot be snoozed', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await answeredDose(schedule.id, 'TAKEN', MARCH_DOSE);

  const response = await snoozeDose(reminder.id, cookie);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(ALREADY_RECORDED);
  expect(await storedReminder(reminder.id)).toEqual(reminder);
});

test('every dose route needs a session', async () => {
  const { user } = await createPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  const responses = [
    await listDoses(),
    await readDose(reminder.id),
    await answerDose(reminder.id, { status: 'TAKEN' }),
    await snoozeDose(reminder.id),
  ];
  for (const response of responses) {
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(UNAUTHORIZED);
  }
  expect(await storedReminder(reminder.id)).toEqual(reminder);
  expect(await storedLog(reminder.id)).toBeNull();
});

test('the admin gets 403 on every dose route', async () => {
  const adminCookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const { user } = await createPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  const responses = [
    await listDoses(adminCookie),
    await readDose(reminder.id, adminCookie),
    await answerDose(reminder.id, { status: 'TAKEN' }, adminCookie),
    await snoozeDose(reminder.id, adminCookie),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
  }
  expect(await storedReminder(reminder.id)).toEqual(reminder);
  expect(await storedLog(reminder.id)).toBeNull();
});

test('an answer or a snooze from another origin gets 403 and changes nothing', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id);
  const reminder = await createReminder(schedule.id, { reminderTime: MARCH_DOSE });

  const responses = [
    await answerDose(reminder.id, { status: 'TAKEN' }, cookie, OTHER_ORIGIN),
    await snoozeDose(reminder.id, cookie, OTHER_ORIGIN),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(BAD_ORIGIN);
  }
  expect(await storedReminder(reminder.id)).toEqual(reminder);
  expect(await storedLog(reminder.id)).toBeNull();
});
