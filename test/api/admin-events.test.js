import { afterAll, afterEach, expect, test } from 'vitest';
import { GET as eventsRoute } from '@/app/api/admin/events/route';
import {
  DELETE as deleteAccountRoute,
  PATCH as updateAccountRoute,
} from '@/app/api/admin/users/[id]/route';
import { prisma } from '@/lib/prisma';
import { createPatient, loginAs, makeRequest, withParams } from '../helpers';

const EVENT_KEYS = ['createdAt', 'email', 'id', 'message', 'type'];
// Made up events are dated far ahead, so they sit at the top of the list
const FUTURE = Date.parse('2099-01-01T00:00:00.000Z');

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } };
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'You cannot do that.' } };

afterEach(async () => {
  // Otherwise the made up events would hide the real ones in later tests
  await prisma.systemEvent.deleteMany({ where: { type: 'TEST_EVENT' } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function listEvents(cookie) {
  return eventsRoute(makeRequest('/api/admin/events', { cookie }));
}

function adminCookie() {
  return loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
}

function suspendAccount(id, cookie) {
  return updateAccountRoute(
    makeRequest(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: { status: 'SUSPENDED' },
      cookie,
    }),
    withParams({ id: String(id) }),
  );
}

function removeAccount(id, cookie) {
  return deleteAccountRoute(
    makeRequest(`/api/admin/users/${id}`, { method: 'DELETE', cookie }),
    withParams({ id: String(id) }),
  );
}

// The event as the API sends it
function shownEvent(event, email) {
  return {
    id: event.id,
    type: event.type,
    message: event.message,
    createdAt: event.createdAt.toISOString(),
    email,
  };
}

test('the list holds the 50 newest events, newest first', async () => {
  const cookie = await adminCookie();
  // Each one a second older than the one before, so the newest has the lowest id
  const older = await prisma.systemEvent.createManyAndReturn({
    data: Array.from({ length: 55 }, (_, index) => ({
      type: 'TEST_EVENT',
      message: `Test event ${index}.`,
      createdAt: new Date(FUTURE - index * 1000),
    })),
  });
  // Two at the same moment and newer than the rest, so the higher id comes first
  const tied = await prisma.systemEvent.createManyAndReturn({
    data: [1, 2].map((number) => ({
      type: 'TEST_EVENT',
      message: `Tied event ${number}.`,
      createdAt: new Date(FUTURE + 1000),
    })),
  });

  const response = await listEvents(cookie);
  expect(response.status).toBe(200);
  const events = await response.json();
  expect(events).toHaveLength(50);

  const expected = [
    ...tied.toSorted((first, second) => second.id - first.id),
    ...older.toSorted((first, second) => second.createdAt - first.createdAt),
  ];
  expect(events).toEqual(expected.slice(0, 50).map((event) => shownEvent(event, null)));
  expect(events[2].message).toBe('Test event 0.');
  expect(events[49].message).toBe('Test event 47.');
});

test('each event shows the linked account email or null, and no other account field', async () => {
  const cookie = await adminCookie();
  const kept = await createPatient();
  const gone = await createPatient();
  const linked = await prisma.systemEvent.create({
    data: {
      type: 'TEST_EVENT',
      message: 'Linked to an account.',
      userId: kept.user.id,
      createdAt: new Date(FUTURE + 3000),
    },
  });
  const linkedToGone = await prisma.systemEvent.create({
    data: {
      type: 'TEST_EVENT',
      message: 'Linked to a removed account.',
      userId: gone.user.id,
      createdAt: new Date(FUTURE + 2000),
    },
  });
  const notLinked = await prisma.systemEvent.create({
    data: {
      type: 'TEST_EVENT',
      message: 'Not linked to an account.',
      createdAt: new Date(FUTURE + 1000),
    },
  });
  await prisma.user.delete({ where: { id: gone.user.id } });

  const response = await listEvents(cookie);
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain('passwordHash');
  expect(text).not.toContain('$2b$');
  expect(text).not.toContain(gone.email);

  const events = JSON.parse(text);
  expect(events.slice(0, 3)).toEqual([
    shownEvent(linked, kept.email),
    shownEvent(linkedToGone, null),
    shownEvent(notLinked, null),
  ]);
  for (const event of events) {
    expect(Object.keys(event).toSorted()).toEqual(EVENT_KEYS);
  }
});

test('a suspension shows with the email, which is gone once the account is removed', async () => {
  const cookie = await adminCookie();
  const { user, email } = await createPatient();

  await suspendAccount(user.id, cookie);
  const afterSuspend = await (await listEvents(cookie)).json();
  expect(afterSuspend[0]).toMatchObject({
    type: 'ACCOUNT_SUSPENDED',
    message: 'An account was suspended.',
    email,
  });

  await removeAccount(user.id, cookie);
  const afterRemove = await (await listEvents(cookie)).json();
  expect(afterRemove[0]).toMatchObject({
    type: 'ACCOUNT_REMOVED',
    message: `Account ${user.id} was removed.`,
    email: null,
  });
  expect(afterRemove[1]).toMatchObject({
    id: afterSuspend[0].id,
    type: 'ACCOUNT_SUSPENDED',
    email: null,
  });
  expect(JSON.stringify(afterRemove)).not.toContain(email);
});

test('a patient gets 403 and no cookie gets 401 on the events list', async () => {
  const patient = await createPatient();
  const patientCookie = await loginAs(patient.email, patient.password);

  const asPatient = await listEvents(patientCookie);
  expect(asPatient.status).toBe(403);
  expect(await asPatient.json()).toEqual(FORBIDDEN);

  const noCookie = await listEvents();
  expect(noCookie.status).toBe(401);
  expect(await noCookie.json()).toEqual(UNAUTHORIZED);
});
