import { afterAll, expect, test } from 'vitest';
import { GET as listRoute, POST as createRoute } from '@/app/api/schedules/route';
import {
  DELETE as deleteRoute,
  GET as readRoute,
  PATCH as updateRoute,
} from '@/app/api/schedules/[id]/route';
import { prisma } from '@/lib/prisma';
import { localDateTime, nextOccurrenceAfter } from '@/lib/time';
import {
  createMedicine,
  createPatient,
  createSchedule,
  loginAs,
  makeRequest,
  withParams,
} from '../helpers';

// New patients get the default zone
const CAIRO = 'Africa/Cairo';
const OTHER_ORIGIN = 'https://other-site.example';
const SCHEDULE_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Schedule not found.' } };
const MEDICINE_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Medicine not found.' } };
const BAD_ID = { error: { code: 'NOT_FOUND', message: 'Not found.' } };
const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };
const BAD_ORIGIN = { error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' } };

// 10 March 2030 is a Sunday, so the next dose is easy to work out by hand
const FUTURE_START = '2030-03-10';
const EDITED = {
  time: '21:30',
  frequency: 'SPECIFIC_DAYS',
  daysOfWeek: [5],
  startDate: FUTURE_START,
  endDate: '2030-03-31',
};

afterAll(async () => {
  await prisma.$disconnect();
});

function listSchedules(medicineId, cookie) {
  return listRoute(makeRequest(`/api/schedules?medicineId=${medicineId}`, { cookie }));
}

function addSchedules(body, cookie, origin) {
  return createRoute(makeRequest('/api/schedules', { method: 'POST', body, cookie, origin }));
}

function readSchedule(id, cookie) {
  return readRoute(makeRequest(`/api/schedules/${id}`, { cookie }), withParams({ id: String(id) }));
}

function updateSchedule(id, body, cookie, origin) {
  return updateRoute(
    makeRequest(`/api/schedules/${id}`, { method: 'PATCH', body, cookie, origin }),
    withParams({ id: String(id) }),
  );
}

function deleteSchedule(id, cookie, origin) {
  return deleteRoute(
    makeRequest(`/api/schedules/${id}`, { method: 'DELETE', cookie, origin }),
    withParams({ id: String(id) }),
  );
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

function storedSchedule(id) {
  return prisma.schedule.findUnique({ where: { id } });
}

function storedSchedules(medicineId) {
  return prisma.schedule.findMany({ where: { medicineId }, orderBy: { id: 'asc' } });
}

// The next dose as time.js works it out, the way the handler should
function nextAt(schedule, now) {
  const next = nextOccurrenceAfter(schedule, CAIRO, now);
  return next ? localDateTime(next, CAIRO) : null;
}

function dateText(date) {
  return date.toISOString().slice(0, 10);
}

test('a patient adds a schedule with two times and gets two rows with 201', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);

  const response = await addSchedules(
    {
      medicineId: medicine.id,
      times: ['20:00', '08:00'],
      frequency: 'DAILY',
      startDate: FUTURE_START,
      endDate: '',
    },
    cookie,
  );
  expect(response.status).toBe(201);
  const schedules = await response.json();
  expect(schedules).toEqual([
    {
      id: expect.any(Number),
      medicineId: medicine.id,
      time: '08:00',
      frequency: 'DAILY',
      daysOfWeek: [],
      startDate: FUTURE_START,
      endDate: null,
      next: { date: FUTURE_START, time: '08:00' },
    },
    {
      id: expect.any(Number),
      medicineId: medicine.id,
      time: '20:00',
      frequency: 'DAILY',
      daysOfWeek: [],
      startDate: FUTURE_START,
      endDate: null,
      next: { date: FUTURE_START, time: '20:00' },
    },
  ]);

  const stored = await storedSchedules(medicine.id);
  expect(stored.map((schedule) => schedule.id)).toEqual(schedules.map((schedule) => schedule.id));
  for (const schedule of stored) {
    expect(schedule.startDate).toEqual(new Date(FUTURE_START));
    expect(schedule.endDate).toBeNull();
  }
});

test('a schedule on chosen days keeps its days and its next dose falls on one', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);

  const response = await addSchedules(
    {
      medicineId: medicine.id,
      times: ['09:15'],
      frequency: 'SPECIFIC_DAYS',
      daysOfWeek: [3, 1],
      startDate: FUTURE_START,
      endDate: '2030-04-30',
    },
    cookie,
  );
  expect(response.status).toBe(201);
  const [schedule] = await response.json();
  // Monday 11 March is the first chosen day after the Sunday start
  expect(schedule).toMatchObject({
    frequency: 'SPECIFIC_DAYS',
    daysOfWeek: [3, 1],
    startDate: FUTURE_START,
    endDate: '2030-04-30',
    next: { date: '2030-03-11', time: '09:15' },
  });
  expect(await storedSchedule(schedule.id)).toMatchObject({
    daysOfWeek: [3, 1],
    endDate: new Date('2030-04-30'),
  });
});

test('the list holds only the chosen medicine of mine, earliest time first', async () => {
  const patientA = await loggedInPatient();
  const patientB = await createPatient();
  const medicine = await createMedicine(patientA.user.id);
  const otherMedicine = await createMedicine(patientA.user.id, { name: 'Other Tablet' });
  const medicineB = await createMedicine(patientB.user.id);
  // Saved first but later in the day, so the order must come from the time
  const evening = await createSchedule(medicine.id, { time: '20:00' });
  const morning = await createSchedule(medicine.id, { time: '07:30' });
  await createSchedule(otherMedicine.id, { time: '12:00' });
  await createSchedule(medicineB.id, { time: '06:00' });

  const before = new Date();
  const response = await listSchedules(medicine.id, patientA.cookie);
  const after = new Date();
  expect(response.status).toBe(200);
  const schedules = await response.json();
  expect(schedules.map((schedule) => schedule.id)).toEqual([morning.id, evening.id]);

  const { next, ...rest } = schedules[0];
  expect(rest).toEqual({
    id: morning.id,
    medicineId: medicine.id,
    time: '07:30',
    frequency: 'DAILY',
    daysOfWeek: [],
    startDate: dateText(morning.startDate),
    endDate: null,
  });
  // The handler ran between the two moments
  expect([nextAt(morning, before), nextAt(morning, after)]).toContainEqual(next);
});

test('a medicine with no schedules gets an empty list', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);

  const response = await listSchedules(medicine.id, cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
});

test('the next dose of a daily schedule matches time.js in the patient zone', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id, { time: '08:00' });

  const before = new Date();
  const response = await readSchedule(schedule.id, cookie);
  const after = new Date();
  expect(response.status).toBe(200);
  const { next } = await response.json();
  expect(next).not.toBeNull();
  expect(next.time).toBe('08:00');
  // The handler ran between the two moments
  expect([nextAt(schedule, before), nextAt(schedule, after)]).toContainEqual(next);
});

test('a schedule that has ended has no next dose', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);

  const response = await addSchedules(
    {
      medicineId: medicine.id,
      times: ['08:00'],
      frequency: 'DAILY',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    },
    cookie,
  );
  expect(response.status).toBe(201);
  const [schedule] = await response.json();
  expect(schedule).toMatchObject({ startDate: '2026-01-01', endDate: '2026-01-31', next: null });
});

test('a patient reads, edits and deletes their own schedule', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id, { startDate: new Date(FUTURE_START) });

  const read = await readSchedule(schedule.id, cookie);
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({
    id: schedule.id,
    medicineId: medicine.id,
    time: '08:00',
    frequency: 'DAILY',
    daysOfWeek: [],
    startDate: FUTURE_START,
    endDate: null,
    next: { date: FUTURE_START, time: '08:00' },
  });

  const beforeEdit = new Date();
  const edited = await updateSchedule(schedule.id, EDITED, cookie);
  const afterEdit = new Date();
  expect(edited.status).toBe(200);
  // The tick counts the changed time only from the moment of this save
  const { updatedAt } = await storedSchedule(schedule.id);
  expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeEdit.getTime());
  expect(updatedAt.getTime()).toBeLessThanOrEqual(afterEdit.getTime());
  // Friday 15 March is the first chosen day after the Sunday start
  expect(await edited.json()).toEqual({
    id: schedule.id,
    medicineId: medicine.id,
    ...EDITED,
    next: { date: '2030-03-15', time: '21:30' },
  });
  expect(await storedSchedule(schedule.id)).toMatchObject({
    medicineId: medicine.id,
    time: '21:30',
    frequency: 'SPECIFIC_DAYS',
    daysOfWeek: [5],
    startDate: new Date(FUTURE_START),
    endDate: new Date('2030-03-31'),
  });

  const daily = await updateSchedule(
    schedule.id,
    { ...EDITED, frequency: 'DAILY', daysOfWeek: [5], endDate: '' },
    cookie,
  );
  expect(daily.status).toBe(200);
  expect(await daily.json()).toMatchObject({ frequency: 'DAILY', daysOfWeek: [], endDate: null });
  expect(await storedSchedule(schedule.id)).toMatchObject({ daysOfWeek: [], endDate: null });

  const deleted = await deleteSchedule(schedule.id, cookie);
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe('');
  expect(await storedSchedule(schedule.id)).toBeNull();
  expect(await prisma.medicine.count({ where: { id: medicine.id } })).toBe(1);

  const readAgain = await readSchedule(schedule.id, cookie);
  expect(readAgain.status).toBe(404);
  expect(await readAgain.json()).toEqual(SCHEDULE_NOT_FOUND);

  const deleteAgain = await deleteSchedule(schedule.id, cookie);
  expect(deleteAgain.status).toBe(404);
  expect(await deleteAgain.json()).toEqual(SCHEDULE_NOT_FOUND);
});

test('deleting a schedule also removes its reminders and dose logs', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id, { startDate: new Date('2026-11-01') });
  const reminder = await prisma.reminder.create({
    data: { scheduleId: schedule.id, reminderTime: new Date('2026-11-01T06:00:00Z') },
  });
  await prisma.doseLog.create({
    data: {
      scheduleId: schedule.id,
      reminderId: reminder.id,
      status: 'TAKEN',
      date: new Date('2026-11-01'),
      time: '08:00',
    },
  });

  const response = await deleteSchedule(schedule.id, cookie);
  expect(response.status).toBe(204);
  expect(await prisma.reminder.count({ where: { id: reminder.id } })).toBe(0);
  expect(await prisma.doseLog.count({ where: { reminderId: reminder.id } })).toBe(0);
});

test('another patient gets 404 on my schedules and they stay the same', async () => {
  const patientA = await createPatient();
  const patientB = await loggedInPatient();
  const medicine = await createMedicine(patientA.user.id);
  const schedule = await createSchedule(medicine.id);

  const responses = [
    await listSchedules(medicine.id, patientB.cookie),
    await addSchedules(
      { medicineId: medicine.id, times: ['09:00'], frequency: 'DAILY', startDate: FUTURE_START },
      patientB.cookie,
    ),
  ];
  for (const response of responses) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(MEDICINE_NOT_FOUND);
  }

  const scheduleResponses = [
    await readSchedule(schedule.id, patientB.cookie),
    await updateSchedule(schedule.id, EDITED, patientB.cookie),
    await deleteSchedule(schedule.id, patientB.cookie),
  ];
  for (const response of scheduleResponses) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(SCHEDULE_NOT_FOUND);
  }
  expect(await storedSchedules(medicine.id)).toEqual([schedule]);
});

test('an edit cannot move a schedule to another medicine', async () => {
  const patientA = await loggedInPatient();
  const patientB = await createPatient();
  const medicine = await createMedicine(patientA.user.id);
  const medicineB = await createMedicine(patientB.user.id);
  const schedule = await createSchedule(medicine.id);

  const response = await updateSchedule(
    schedule.id,
    { ...EDITED, medicineId: medicineB.id, id: 999999 },
    patientA.cookie,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: schedule.id, medicineId: medicine.id });
  expect(await storedSchedule(schedule.id)).toMatchObject({ medicineId: medicine.id });
  expect(await storedSchedules(medicineB.id)).toEqual([]);
});

test('an id that is not a number, is too large or does not exist gets 404', async () => {
  const { cookie } = await loggedInPatient();

  for (const medicineId of ['', 'abc', '1.5', '2147483648']) {
    const response = await listSchedules(medicineId, cookie);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(BAD_ID);
  }
  const noQuery = await listRoute(makeRequest('/api/schedules', { cookie }));
  expect(noQuery.status).toBe(404);
  expect(await noQuery.json()).toEqual(BAD_ID);

  for (const id of ['abc', '1.5', '2147483648']) {
    const responses = [
      await readSchedule(id, cookie),
      await updateSchedule(id, EDITED, cookie),
      await deleteSchedule(id, cookie),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(BAD_ID);
    }
  }

  const missingMedicine = await addSchedules(
    { medicineId: 2147483647, times: ['09:00'], frequency: 'DAILY', startDate: FUTURE_START },
    cookie,
  );
  expect(missingMedicine.status).toBe(404);
  expect(await missingMedicine.json()).toEqual(MEDICINE_NOT_FOUND);
  const missingSchedule = await readSchedule(2147483647, cookie);
  expect(missingSchedule.status).toBe(404);
  expect(await missingSchedule.json()).toEqual(SCHEDULE_NOT_FOUND);
});

test('UC5 a missing time or frequency gets 400 with the plain message', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id);
  const base = { medicineId: medicine.id, startDate: FUTURE_START };

  const noTime = await addSchedules({ ...base, frequency: 'DAILY' }, cookie);
  expect(noTime.status).toBe(400);
  expect(await noTime.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Please choose a time.' },
  });

  const noFrequency = await addSchedules({ ...base, times: ['08:00'] }, cookie);
  expect(noFrequency.status).toBe(400);
  expect(await noFrequency.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Please choose how often.' },
  });

  const editNoTime = await updateSchedule(schedule.id, { ...EDITED, time: '' }, cookie);
  expect(editNoTime.status).toBe(400);
  expect(await editNoTime.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Please choose a time.' },
  });

  const editNoFrequency = await updateSchedule(
    schedule.id,
    { ...EDITED, frequency: undefined },
    cookie,
  );
  expect(editNoFrequency.status).toBe(400);
  expect(await editNoFrequency.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Please choose how often.' },
  });

  expect(await storedSchedules(medicine.id)).toEqual([schedule]);
});

test('UC5 a schedule on chosen days with no day gets 400', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id);
  const noDay = { error: { code: 'VALIDATION', message: 'Please choose at least one day.' } };

  const added = await addSchedules(
    {
      medicineId: medicine.id,
      times: ['08:00'],
      frequency: 'SPECIFIC_DAYS',
      daysOfWeek: [],
      startDate: FUTURE_START,
    },
    cookie,
  );
  expect(added.status).toBe(400);
  expect(await added.json()).toEqual(noDay);

  const edited = await updateSchedule(schedule.id, { ...EDITED, daysOfWeek: [] }, cookie);
  expect(edited.status).toBe(400);
  expect(await edited.json()).toEqual(noDay);

  expect(await storedSchedules(medicine.id)).toEqual([schedule]);
});

test('UC5 an end date before the start date gets 400', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id);
  const endBeforeStart = {
    error: { code: 'VALIDATION', message: 'The end date cannot be before the start date.' },
  };

  const added = await addSchedules(
    {
      medicineId: medicine.id,
      times: ['08:00'],
      frequency: 'DAILY',
      startDate: FUTURE_START,
      endDate: '2030-03-09',
    },
    cookie,
  );
  expect(added.status).toBe(400);
  expect(await added.json()).toEqual(endBeforeStart);

  const edited = await updateSchedule(schedule.id, { ...EDITED, endDate: '2030-03-09' }, cookie);
  expect(edited.status).toBe(400);
  expect(await edited.json()).toEqual(endBeforeStart);

  expect(await storedSchedules(medicine.id)).toEqual([schedule]);
});

test('every schedule route needs a session', async () => {
  const { user } = await createPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id);

  const responses = [
    await listSchedules(medicine.id),
    await addSchedules({
      medicineId: medicine.id,
      times: ['09:00'],
      frequency: 'DAILY',
      startDate: FUTURE_START,
    }),
    await readSchedule(schedule.id),
    await updateSchedule(schedule.id, EDITED),
    await deleteSchedule(schedule.id),
  ];
  for (const response of responses) {
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(UNAUTHORIZED);
  }
  expect(await storedSchedules(medicine.id)).toEqual([schedule]);
});

test('the admin gets 403 on every schedule route', async () => {
  const adminCookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const { user } = await createPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id);

  const responses = [
    await listSchedules(medicine.id, adminCookie),
    await addSchedules(
      { medicineId: medicine.id, times: ['09:00'], frequency: 'DAILY', startDate: FUTURE_START },
      adminCookie,
    ),
    await readSchedule(schedule.id, adminCookie),
    await updateSchedule(schedule.id, EDITED, adminCookie),
    await deleteSchedule(schedule.id, adminCookie),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
  }
  expect(await storedSchedules(medicine.id)).toEqual([schedule]);
});

test('a schedule change from another origin gets 403 and changes nothing', async () => {
  const { user, cookie } = await loggedInPatient();
  const medicine = await createMedicine(user.id);
  const schedule = await createSchedule(medicine.id);

  const responses = [
    await addSchedules(
      { medicineId: medicine.id, times: ['09:00'], frequency: 'DAILY', startDate: FUTURE_START },
      cookie,
      OTHER_ORIGIN,
    ),
    await updateSchedule(schedule.id, EDITED, cookie, OTHER_ORIGIN),
    await deleteSchedule(schedule.id, cookie, OTHER_ORIGIN),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(BAD_ORIGIN);
  }
  expect(await storedSchedules(medicine.id)).toEqual([schedule]);
});
