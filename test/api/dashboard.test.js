import { afterAll, expect, test } from 'vitest';
import { GET as dashboardRoute } from '@/app/api/dashboard/route';
import { prisma } from '@/lib/prisma';
import {
  createMedicine,
  createPatient,
  createReminder,
  createSchedule,
  loginAs,
  makeRequest,
} from '../helpers';

const MORNING = { name: 'Morning Tablet', dosage: '250 mg' };
const NIGHT = { name: 'Night Syrup', dosage: '5 mL' };
const NO_TOTALS = { taken: 0, missed: 0, skipped: 0, rate: null };

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };

afterAll(async () => {
  await prisma.$disconnect();
});

function openDashboard(cookie) {
  return dashboardRoute(makeRequest('/api/dashboard', { cookie }));
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

// A medicine with one daily schedule; each test adds the logs it needs
async function scheduleFor(userId, medicine) {
  const { id } = await createMedicine(userId, medicine);
  return createSchedule(id, { startDate: new Date('2026-01-01') });
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

test('a new patient gets zero totals, no rate, no history and no medicines (UC7)', async () => {
  const { cookie } = await loggedInPatient();

  const response = await openDashboard(cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ totals: NO_TOTALS, history: [], medicineCount: 0 });
});

test('a medicine with no answers yet counts, while the rate stays empty', async () => {
  const { user, cookie } = await loggedInPatient();
  await scheduleFor(user.id, MORNING);

  const response = await openDashboard(cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ totals: NO_TOTALS, history: [], medicineCount: 1 });
});

test('the dashboard shows only my totals, my history newest first and my medicines', async () => {
  const { user, cookie } = await loggedInPatient();
  const morning = await scheduleFor(user.id, MORNING);
  const night = await scheduleFor(user.id, NIGHT);
  // A medicine with no dose times still counts
  await createMedicine(user.id, { name: 'Spare Cream', dosage: '1 tube' });
  const first = await loggedDose(morning.id, 'TAKEN', '2026-03-10', '08:00');
  const second = await loggedDose(night.id, 'MISSED', '2026-03-10', '21:00');
  const third = await loggedDose(morning.id, 'SKIPPED', '2026-03-11', '08:00');
  const fourth = await loggedDose(night.id, 'TAKEN', '2026-03-09', '21:00');
  const fifth = await loggedDose(morning.id, 'TAKEN', '2026-03-12', '08:00');

  const other = await loggedInPatient();
  const otherMedicine = { name: 'Other Tablet', dosage: '10 mg' };
  const otherSchedule = await scheduleFor(other.user.id, otherMedicine);
  // Newer than mine, so a leak would sit at the top of my history
  const otherFirst = await loggedDose(otherSchedule.id, 'TAKEN', '2026-03-13', '08:00');
  const otherSecond = await loggedDose(otherSchedule.id, 'TAKEN', '2026-03-13', '21:00');

  const response = await openDashboard(cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    totals: { taken: 3, missed: 1, skipped: 1, rate: 60 },
    history: [
      shown(fifth, MORNING, '2026-03-12'),
      shown(third, MORNING, '2026-03-11'),
      shown(second, NIGHT, '2026-03-10'),
      shown(first, MORNING, '2026-03-10'),
      shown(fourth, NIGHT, '2026-03-09'),
    ],
    medicineCount: 3,
  });

  const otherResponse = await openDashboard(other.cookie);
  expect(await otherResponse.json()).toEqual({
    totals: { taken: 2, missed: 0, skipped: 0, rate: 100 },
    history: [
      shown(otherSecond, otherMedicine, '2026-03-13'),
      shown(otherFirst, otherMedicine, '2026-03-13'),
    ],
    medicineCount: 1,
  });
});

test('the history stops at the newest 30 logs, while the totals count every log', async () => {
  const { user, cookie } = await loggedInPatient();
  const schedule = await scheduleFor(user.id, MORNING);
  // 32 days in a row, from 1 January to 1 February 2026
  const days = Array.from({ length: 32 }, (_, index) =>
    new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
  );
  const logs = await Promise.all(days.map((day) => loggedDose(schedule.id, 'TAKEN', day)));

  const response = await openDashboard(cookie);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.totals).toEqual({ taken: 32, missed: 0, skipped: 0, rate: 100 });
  expect(body.history).toHaveLength(30);
  expect(body.history[0].date).toBe('2026-02-01');
  expect(body.history[29].date).toBe('2026-01-03');
  expect(body.history.map((row) => row.id)).toEqual(
    logs
      .toReversed()
      .slice(0, 30)
      .map((log) => log.id),
  );
});

test('the dashboard needs a session', async () => {
  const response = await openDashboard();
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual(UNAUTHORIZED);
});

test('the admin gets 403 on the dashboard', async () => {
  const adminCookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const response = await openDashboard(adminCookie);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(FORBIDDEN);
});
