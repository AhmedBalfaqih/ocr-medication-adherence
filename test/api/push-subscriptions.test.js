import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import {
  DELETE as unsubscribeRoute,
  POST as subscribeRoute,
} from '@/app/api/push/subscriptions/route';
import { prisma } from '@/lib/prisma';
import { createPatient, loginAs, makeRequest } from '../helpers';

const OTHER_ORIGIN = 'https://other-site.example';
const PUSH_NOT_VALID = {
  error: {
    code: 'VALIDATION',
    message: 'Reminders could not be turned on for this device. Please try again.',
  },
};
const NOT_ON = { error: { code: 'NOT_FOUND', message: 'Reminders are not on for this device.' } };
const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };
const BAD_ORIGIN = { error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' } };

afterAll(async () => {
  await prisma.$disconnect();
});

// A made up push service address, new for each device
function newEndpoint() {
  return `https://push.example.com/send/${randomUUID()}`;
}

// Shaped like PushSubscription.toJSON() in a browser
function deviceSubscription(endpoint, keyName = 'first') {
  return {
    endpoint,
    expirationTime: null,
    keys: { p256dh: `test-p256dh-${keyName}`, auth: `test-auth-${keyName}` },
  };
}

function subscribe(body, cookie, origin) {
  return subscribeRoute(
    makeRequest('/api/push/subscriptions', { method: 'POST', body, cookie, origin }),
  );
}

function unsubscribe(endpoint, cookie, origin) {
  const query = endpoint === undefined ? '' : `?endpoint=${encodeURIComponent(endpoint)}`;
  return unsubscribeRoute(
    makeRequest(`/api/push/subscriptions${query}`, { method: 'DELETE', cookie, origin }),
  );
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

// Straight to the database, so a test sets up only what it checks
function savedDevice(userId, endpoint) {
  return prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: 'test-p256dh-saved', auth: 'test-auth-saved' },
  });
}

function storedDevice(endpoint) {
  return prisma.pushSubscription.findUnique({ where: { endpoint } });
}

test('a patient turns reminders on and the device is saved with its keys', async () => {
  const { user, cookie } = await loggedInPatient();
  const endpoint = newEndpoint();

  const response = await subscribe(deviceSubscription(endpoint), cookie);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ id: expect.any(Number) });

  expect(await storedDevice(endpoint)).toMatchObject({
    id: body.id,
    userId: user.id,
    endpoint,
    p256dh: 'test-p256dh-first',
    auth: 'test-auth-first',
  });
});

test('the same device sent again keeps one row and takes the new keys', async () => {
  const { user, cookie } = await loggedInPatient();
  const endpoint = newEndpoint();
  const first = await (await subscribe(deviceSubscription(endpoint), cookie)).json();

  const response = await subscribe(deviceSubscription(endpoint, 'second'), cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: first.id });

  expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);
  expect(await storedDevice(endpoint)).toMatchObject({
    id: first.id,
    userId: user.id,
    p256dh: 'test-p256dh-second',
    auth: 'test-auth-second',
  });
});

test('a device that changes hands moves to the new account', async () => {
  const before = await createPatient();
  const after = await loggedInPatient();
  const endpoint = newEndpoint();
  const device = await savedDevice(before.user.id, endpoint);

  const response = await subscribe(deviceSubscription(endpoint), after.cookie);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: device.id });

  expect(await storedDevice(endpoint)).toMatchObject({ id: device.id, userId: after.user.id });
  expect(await prisma.pushSubscription.count({ where: { userId: before.user.id } })).toBe(0);
});

test('turning reminders off deletes only that device of this patient', async () => {
  const { user, cookie } = await loggedInPatient();
  const phone = await savedDevice(user.id, newEndpoint());
  const laptop = await savedDevice(user.id, newEndpoint());
  const other = await createPatient();
  const otherDevice = await savedDevice(other.user.id, newEndpoint());

  const response = await unsubscribe(phone.endpoint, cookie);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');

  expect(await storedDevice(phone.endpoint)).toBeNull();
  expect(await storedDevice(laptop.endpoint)).toEqual(laptop);
  expect(await storedDevice(otherDevice.endpoint)).toEqual(otherDevice);
});

test("a patient cannot turn off another patient's device and gets 404", async () => {
  const { user, cookie } = await loggedInPatient();
  const mine = await savedDevice(user.id, newEndpoint());
  const other = await createPatient();
  const otherDevice = await savedDevice(other.user.id, newEndpoint());

  const response = await unsubscribe(otherDevice.endpoint, cookie);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(NOT_ON);
  expect(await storedDevice(otherDevice.endpoint)).toEqual(otherDevice);

  expect((await unsubscribe(mine.endpoint, cookie)).status).toBe(204);
  const again = await unsubscribe(mine.endpoint, cookie);
  expect(again.status).toBe(404);
  expect(await again.json()).toEqual(NOT_ON);
});

test('a subscription that is not valid gets 400 and saves nothing', async () => {
  const { user, cookie } = await loggedInPatient();
  const endpoint = newEndpoint();
  const bodies = [
    deviceSubscription(endpoint.replace('https:', 'http:')),
    deviceSubscription('https://127.0.0.1/send/test-device'),
    { endpoint },
    { ...deviceSubscription(endpoint), keys: { p256dh: 'test-p256dh-first', auth: '' } },
  ];
  for (const body of bodies) {
    const response = await subscribe(body, cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(PUSH_NOT_VALID);
  }
  expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
});

test('turning reminders off without a valid endpoint gets 400 and deletes nothing', async () => {
  const { user, cookie } = await loggedInPatient();
  const device = await savedDevice(user.id, newEndpoint());

  for (const endpoint of [undefined, '', 'https://localhost/send/test-device']) {
    const response = await unsubscribe(endpoint, cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(PUSH_NOT_VALID);
  }
  expect(await storedDevice(device.endpoint)).toEqual(device);
});

test('every push route needs a session', async () => {
  const { user } = await createPatient();
  const device = await savedDevice(user.id, newEndpoint());
  const endpoint = newEndpoint();

  const responses = [
    await subscribe(deviceSubscription(endpoint)),
    await unsubscribe(device.endpoint),
  ];
  for (const response of responses) {
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(UNAUTHORIZED);
  }
  expect(await storedDevice(endpoint)).toBeNull();
  expect(await storedDevice(device.endpoint)).toEqual(device);
});

test('the admin gets 403 on every push route', async () => {
  const adminCookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const { user } = await createPatient();
  const device = await savedDevice(user.id, newEndpoint());
  const endpoint = newEndpoint();

  const responses = [
    await subscribe(deviceSubscription(endpoint), adminCookie),
    await unsubscribe(device.endpoint, adminCookie),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
  }
  expect(await storedDevice(endpoint)).toBeNull();
  expect(await storedDevice(device.endpoint)).toEqual(device);
});

test('a push change from another origin gets 403 and changes nothing', async () => {
  const { user, cookie } = await loggedInPatient();
  const device = await savedDevice(user.id, newEndpoint());
  const endpoint = newEndpoint();

  const responses = [
    await subscribe(deviceSubscription(endpoint), cookie, OTHER_ORIGIN),
    await unsubscribe(device.endpoint, cookie, OTHER_ORIGIN),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(BAD_ORIGIN);
  }
  expect(await storedDevice(endpoint)).toBeNull();
  expect(await storedDevice(device.endpoint)).toEqual(device);
});
