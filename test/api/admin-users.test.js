import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { GET as listRoute } from '@/app/api/admin/users/route';
import { DELETE as deleteRoute, PATCH as updateRoute } from '@/app/api/admin/users/[id]/route';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { GET as listMedicinesRoute } from '@/app/api/medicines/route';
import { prisma } from '@/lib/prisma';
import {
  createMedicine,
  createOcrScan,
  createPatient,
  createReminder,
  createSchedule,
  loginAs,
  makeRequest,
  withParams,
} from '../helpers';

const OTHER_ORIGIN = 'https://other-site.example';
const ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
};
const ACCOUNT_KEYS = ['createdAt', 'email', 'id', 'name', 'role', 'status'];
const ONE_OF_EACH = {
  medicines: 1,
  schedules: 1,
  reminders: 1,
  doseLogs: 1,
  ocrScans: 1,
  pushSubscriptions: 1,
};
const NONE_LEFT = {
  medicines: 0,
  schedules: 0,
  reminders: 0,
  doseLogs: 0,
  ocrScans: 0,
  pushSubscriptions: 0,
};

const ACCOUNT_NOT_FOUND = {
  error: { code: 'NOT_FOUND', message: 'We could not find this account.' },
};
const NOT_A_PATIENT = {
  error: { code: 'FORBIDDEN', message: 'Only patient accounts can be changed.' },
};
const BAD_ID = { error: { code: 'NOT_FOUND', message: 'Not found.' } };
const BAD_STATUS = { error: { code: 'VALIDATION', message: 'Please choose Active or Suspended.' } };
const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };
const BAD_ORIGIN = { error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' } };
const LOGIN_FAILED = {
  error: { code: 'LOGIN_FAILED', message: 'Email or password is incorrect.' },
};

afterAll(async () => {
  await prisma.$disconnect();
});

function listAccounts(cookie) {
  return listRoute(makeRequest('/api/admin/users', { cookie }));
}

function changeStatus(id, body, cookie, origin) {
  return updateRoute(
    makeRequest(`/api/admin/users/${id}`, { method: 'PATCH', body, cookie, origin }),
    withParams({ id: String(id) }),
  );
}

function removeAccount(id, cookie, origin) {
  return deleteRoute(
    makeRequest(`/api/admin/users/${id}`, { method: 'DELETE', cookie, origin }),
    withParams({ id: String(id) }),
  );
}

function checkSession(cookie) {
  return me(makeRequest('/api/auth/me', { cookie }));
}

function logIn(email, password) {
  return login(makeRequest('/api/auth/login', { method: 'POST', body: { email, password } }));
}

function adminCookie() {
  return loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

function storedAccount(id) {
  return prisma.user.findUnique({ where: { id }, select: ACCOUNT_SELECT });
}

// The account as the API sends it, with the date as a string
function asJson(account) {
  return { ...account, createdAt: account.createdAt.toISOString() };
}

function latestEvent(type) {
  return prisma.systemEvent.findFirst({ where: { type }, orderBy: { id: 'desc' } });
}

// Same order as the route: newest first, then the higher id on a tie
function newestFirst(first, second) {
  return Date.parse(second.createdAt) - Date.parse(first.createdAt) || second.id - first.id;
}

// One of each kind of medical record, written straight to the database
async function addMedicalData(userId) {
  const medicine = await createMedicine(userId);
  const schedule = await createSchedule(medicine.id);
  const reminder = await createReminder(schedule.id);
  const doseLog = await prisma.doseLog.create({
    data: {
      scheduleId: schedule.id,
      reminderId: reminder.id,
      status: 'TAKEN',
      date: new Date('2026-03-10'),
      time: '08:00',
    },
  });
  const ocrScan = await createOcrScan(userId, { medicineId: medicine.id });
  const pushSubscription = await prisma.pushSubscription.create({
    data: {
      userId,
      endpoint: `https://push.example.com/send/${randomUUID()}`,
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  });
  return { medicine, schedule, reminder, doseLog, ocrScan, pushSubscription };
}

// Counts each record by its own id, so a row left behind shows up
async function countRows(data) {
  return {
    medicines: await prisma.medicine.count({ where: { id: data.medicine.id } }),
    schedules: await prisma.schedule.count({ where: { id: data.schedule.id } }),
    reminders: await prisma.reminder.count({ where: { id: data.reminder.id } }),
    doseLogs: await prisma.doseLog.count({ where: { id: data.doseLog.id } }),
    ocrScans: await prisma.oCRScan.count({ where: { id: data.ocrScan.id } }),
    pushSubscriptions: await prisma.pushSubscription.count({
      where: { id: data.pushSubscription.id },
    }),
  };
}

test('the list holds every account, newest first, with only the six account fields', async () => {
  const cookie = await adminCookie();
  const first = await createPatient();
  await addMedicalData(first.user.id);
  const second = await createPatient();

  const response = await listAccounts(cookie);
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain('passwordHash');
  expect(text).not.toContain('$2b$');
  expect(text).not.toContain('Test Medicine');
  expect(text).not.toContain('TESTAMOL');
  expect(text).not.toContain('push.example.com');

  const accounts = JSON.parse(text);
  for (const account of accounts) {
    // No medicines, counts or other relations, only the account itself
    expect(Object.keys(account).toSorted()).toEqual(ACCOUNT_KEYS);
  }

  const admin = await prisma.user.findUnique({
    where: { email: process.env.SEED_ADMIN_EMAIL },
    select: ACCOUNT_SELECT,
  });
  expect(accounts).toContainEqual(asJson(await storedAccount(first.user.id)));
  expect(accounts).toContainEqual(asJson(await storedAccount(second.user.id)));
  expect(accounts).toContainEqual(asJson(admin));

  const ids = accounts.map((account) => account.id);
  expect(ids).toEqual(accounts.toSorted(newestFirst).map((account) => account.id));
  expect(ids.indexOf(second.user.id)).toBeLessThan(ids.indexOf(first.user.id));
  // The seed runs before any test file, so the admin is older than both
  expect(ids.indexOf(first.user.id)).toBeLessThan(ids.indexOf(admin.id));
});

test('suspending a patient writes ACCOUNT_SUSPENDED and ends their session at once', async () => {
  const cookie = await adminCookie();
  const patient = await loggedInPatient();
  expect((await checkSession(patient.cookie)).status).toBe(200);

  const response = await changeStatus(patient.user.id, { status: 'SUSPENDED' }, cookie);
  expect(response.status).toBe(200);
  const stored = await storedAccount(patient.user.id);
  expect(stored.status).toBe('SUSPENDED');
  expect(await response.json()).toEqual(asJson(stored));
  expect(await latestEvent('ACCOUNT_SUSPENDED')).toMatchObject({
    message: 'An account was suspended.',
    userId: patient.user.id,
  });

  // The cookie from before the suspension stops working on the next request
  const meResponse = await checkSession(patient.cookie);
  expect(meResponse.status).toBe(401);
  expect(await meResponse.json()).toEqual(UNAUTHORIZED);
  const medicines = await listMedicinesRoute(
    makeRequest('/api/medicines', { cookie: patient.cookie }),
  );
  expect(medicines.status).toBe(401);
  expect(await medicines.json()).toEqual(UNAUTHORIZED);

  const loginResponse = await logIn(patient.email, patient.password);
  expect(loginResponse.status).toBe(401);
  expect(await loginResponse.json()).toEqual(LOGIN_FAILED);
  expect(loginResponse.cookies.get('session')).toBeUndefined();
});

test('activating a suspended patient writes ACCOUNT_ACTIVATED and lets them back in', async () => {
  const cookie = await adminCookie();
  const patient = await loggedInPatient();
  await changeStatus(patient.user.id, { status: 'SUSPENDED' }, cookie);
  expect((await checkSession(patient.cookie)).status).toBe(401);

  const response = await changeStatus(patient.user.id, { status: 'ACTIVE' }, cookie);
  expect(response.status).toBe(200);
  const stored = await storedAccount(patient.user.id);
  expect(stored.status).toBe('ACTIVE');
  expect(await response.json()).toEqual(asJson(stored));
  expect(await latestEvent('ACCOUNT_ACTIVATED')).toMatchObject({
    message: 'An account was activated.',
    userId: patient.user.id,
  });

  expect((await checkSession(patient.cookie)).status).toBe(200);
  const loginResponse = await logIn(patient.email, patient.password);
  expect(loginResponse.status).toBe(200);
});

test('setting the status an account already has still returns 200', async () => {
  const cookie = await adminCookie();
  const { user } = await createPatient();

  const active = await changeStatus(user.id, { status: 'ACTIVE' }, cookie);
  expect(active.status).toBe(200);
  expect((await active.json()).status).toBe('ACTIVE');

  await changeStatus(user.id, { status: 'SUSPENDED' }, cookie);
  const again = await changeStatus(user.id, { status: 'SUSPENDED' }, cookie);
  expect(again.status).toBe(200);
  expect((await again.json()).status).toBe('SUSPENDED');
  expect((await storedAccount(user.id)).status).toBe('SUSPENDED');
});

test('the admin cannot suspend or remove their own account or another admin', async () => {
  const cookie = await adminCookie();
  const admin = await prisma.user.findUnique({
    where: { email: process.env.SEED_ADMIN_EMAIL },
    select: ACCOUNT_SELECT,
  });
  // Never logs in, so the hash is only a placeholder
  const otherAdmin = await prisma.user.create({
    data: {
      name: 'Second Admin',
      email: `admin-${randomUUID()}@example.com`,
      passwordHash: 'not-a-real-hash',
      role: 'ADMIN',
    },
    select: ACCOUNT_SELECT,
  });

  for (const account of [admin, otherAdmin]) {
    for (const status of ['SUSPENDED', 'ACTIVE']) {
      const changed = await changeStatus(account.id, { status }, cookie);
      expect(changed.status).toBe(403);
      expect(await changed.json()).toEqual(NOT_A_PATIENT);
    }
    const removed = await removeAccount(account.id, cookie);
    expect(removed.status).toBe(403);
    expect(await removed.json()).toEqual(NOT_A_PATIENT);
    expect(await storedAccount(account.id)).toEqual(account);
  }

  expect((await checkSession(cookie)).status).toBe(200);
  await prisma.user.delete({ where: { id: otherAdmin.id } });
});

test('removing a patient deletes all their medical data and writes ACCOUNT_REMOVED', async () => {
  const cookie = await adminCookie();
  const patient = await loggedInPatient();
  const data = await addMedicalData(patient.user.id);
  const event = await prisma.systemEvent.create({
    data: { type: 'LOGIN_FAILED', message: 'A login failed.', userId: patient.user.id },
  });
  const other = await createPatient();
  const otherData = await addMedicalData(other.user.id);
  expect(await countRows(data)).toEqual(ONE_OF_EACH);

  const response = await removeAccount(patient.user.id, cookie);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');

  expect(await prisma.user.count({ where: { id: patient.user.id } })).toBe(0);
  expect(await countRows(data)).toEqual(NONE_LEFT);
  // Older events stay, but no longer point at the removed account
  expect(await prisma.systemEvent.findUnique({ where: { id: event.id } })).toMatchObject({
    userId: null,
  });
  const removed = await latestEvent('ACCOUNT_REMOVED');
  expect(removed).toMatchObject({
    message: `Account ${patient.user.id} was removed.`,
    userId: null,
  });
  expect(removed.message).not.toContain(patient.email);

  // Another patient keeps everything
  expect(await countRows(otherData)).toEqual(ONE_OF_EACH);
  expect(await storedAccount(other.user.id)).not.toBeNull();

  expect((await checkSession(patient.cookie)).status).toBe(401);
  const again = await removeAccount(patient.user.id, cookie);
  expect(again.status).toBe(404);
  expect(await again.json()).toEqual(ACCOUNT_NOT_FOUND);
});

test('an unknown account gets 404, and a bad id gets 404 too', async () => {
  const cookie = await adminCookie();
  // The largest id a Postgres integer can hold; tests never get near it
  const unknownId = 2147483647;

  const unknown = [
    await changeStatus(unknownId, { status: 'SUSPENDED' }, cookie),
    await removeAccount(unknownId, cookie),
  ];
  for (const response of unknown) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(ACCOUNT_NOT_FOUND);
  }

  for (const id of ['abc', '1.5', '0', '2147483648']) {
    const responses = [
      await changeStatus(id, { status: 'SUSPENDED' }, cookie),
      await removeAccount(id, cookie),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(BAD_ID);
    }
  }
});

test('a status that is not Active or Suspended gets 400 and changes nothing', async () => {
  const cookie = await adminCookie();
  const { user } = await createPatient();

  for (const body of [{}, { status: 'DELETED' }, { status: 'active' }, { status: null }]) {
    const response = await changeStatus(user.id, body, cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(BAD_STATUS);
  }
  expect((await storedAccount(user.id)).status).toBe('ACTIVE');
});

test('a role in the body is ignored, so the role never changes', async () => {
  const cookie = await adminCookie();
  const { user } = await createPatient();

  const withStatus = await changeStatus(
    user.id,
    { status: 'ACTIVE', role: 'ADMIN', name: 'Changed Name' },
    cookie,
  );
  expect(withStatus.status).toBe(200);
  expect(await withStatus.json()).toMatchObject({ role: 'PATIENT', name: 'Test Patient' });

  const roleOnly = await changeStatus(user.id, { role: 'ADMIN' }, cookie);
  expect(roleOnly.status).toBe(400);
  expect(await roleOnly.json()).toEqual(BAD_STATUS);

  expect(await storedAccount(user.id)).toMatchObject({
    role: 'PATIENT',
    name: 'Test Patient',
    status: 'ACTIVE',
  });
});

test('a patient gets 403 and no cookie gets 401 on every account route', async () => {
  const patient = await loggedInPatient();
  const target = await createPatient();

  const asPatient = [
    await listAccounts(patient.cookie),
    await changeStatus(target.user.id, { status: 'SUSPENDED' }, patient.cookie),
    await removeAccount(target.user.id, patient.cookie),
    await changeStatus(patient.user.id, { status: 'SUSPENDED' }, patient.cookie),
    await removeAccount(patient.user.id, patient.cookie),
  ];
  for (const response of asPatient) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
  }

  const noCookie = [
    await listAccounts(),
    await changeStatus(target.user.id, { status: 'SUSPENDED' }),
    await removeAccount(target.user.id),
  ];
  for (const response of noCookie) {
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(UNAUTHORIZED);
  }

  expect((await storedAccount(target.user.id)).status).toBe('ACTIVE');
  expect((await storedAccount(patient.user.id)).status).toBe('ACTIVE');
});

test('a PATCH or DELETE from another origin gets 403 and changes nothing', async () => {
  const cookie = await adminCookie();
  const { user } = await createPatient();

  const responses = [
    await changeStatus(user.id, { status: 'SUSPENDED' }, cookie, OTHER_ORIGIN),
    await removeAccount(user.id, cookie, OTHER_ORIGIN),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(BAD_ORIGIN);
  }
  expect((await storedAccount(user.id)).status).toBe('ACTIVE');
});
