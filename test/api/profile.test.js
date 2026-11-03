import { NextRequest } from 'next/server';
import { afterAll, expect, test } from 'vitest';
import { PATCH } from '@/app/api/auth/profile/route';
import { GET as me } from '@/app/api/auth/me/route';
import { prisma } from '@/lib/prisma';
import { createPatient, loginAs, makeRequest } from '../helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

function updateProfile(body, cookie, origin) {
  return PATCH(makeRequest('/api/auth/profile', { method: 'PATCH', body, cookie, origin }));
}

async function loggedInPatient() {
  const patient = await createPatient();
  const cookie = await loginAs(patient.email, patient.password);
  return { ...patient, cookie };
}

test('a patient updates their own name, date of birth and conditions', async () => {
  const { user, email, cookie } = await loggedInPatient();

  const response = await updateProfile(
    { name: 'Updated Name', dateOfBirth: '1950-03-14', conditions: 'High blood pressure' },
    cookie,
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain('passwordHash');
  const expected = {
    id: user.id,
    name: 'Updated Name',
    email,
    role: 'PATIENT',
    status: 'ACTIVE',
    timezone: 'Africa/Cairo',
    dateOfBirth: '1950-03-14T00:00:00.000Z',
    conditions: 'High blood pressure',
  };
  expect(JSON.parse(text)).toEqual(expected);

  const meResponse = await me(makeRequest('/api/auth/me', { cookie }));
  expect(await meResponse.json()).toEqual({ ...expected, today: expect.any(String) });
});

test('a blank field clears the value and a missing field stays as it is', async () => {
  const { cookie } = await loggedInPatient();
  await updateProfile(
    { name: 'Test Patient', dateOfBirth: '1950-03-14', conditions: 'Asthma' },
    cookie,
  );

  const nameOnly = await updateProfile({ name: 'New Name' }, cookie);
  expect(await nameOnly.json()).toMatchObject({
    name: 'New Name',
    dateOfBirth: '1950-03-14T00:00:00.000Z',
    conditions: 'Asthma',
  });

  const cleared = await updateProfile(
    { name: 'New Name', dateOfBirth: '', conditions: '' },
    cookie,
  );
  expect(await cleared.json()).toMatchObject({ dateOfBirth: null, conditions: null });
});

test('a patient can only change their own profile', async () => {
  const patientA = await loggedInPatient();
  const patientB = await createPatient();

  const response = await updateProfile(
    {
      name: 'Changed Name',
      id: patientB.user.id,
      email: patientB.email,
      role: 'ADMIN',
      status: 'SUSPENDED',
      timezone: 'Europe/London',
    },
    patientA.cookie,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: patientA.user.id,
    name: 'Changed Name',
    email: patientA.email,
    role: 'PATIENT',
    status: 'ACTIVE',
    timezone: 'Africa/Cairo',
  });

  const storedB = await prisma.user.findUnique({
    where: { id: patientB.user.id },
    select: { name: true, email: true },
  });
  expect(storedB).toEqual({ name: 'Test Patient', email: patientB.email });
});

test('an admin gets 403 on the profile route', async () => {
  const cookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const response = await updateProfile({ name: 'Changed Admin' }, cookie);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { code: 'FORBIDDEN', message: 'You cannot do that.' },
  });

  const admin = await prisma.user.findUnique({
    where: { email: process.env.SEED_ADMIN_EMAIL.toLowerCase() },
    select: { name: true },
  });
  expect(admin.name).toBe('Site Admin');
});

test('a profile update without a session gets 401', async () => {
  const response = await updateProfile({ name: 'Nobody' });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: { code: 'UNAUTHORIZED', message: 'Please log in.' },
  });
});

test('a future date of birth gets 400 with a plain message', async () => {
  const { cookie } = await loggedInPatient();
  const nextYear = `${new Date().getUTCFullYear() + 1}-01-01`;

  const response = await updateProfile({ name: 'Test Patient', dateOfBirth: nextYear }, cookie);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: { code: 'VALIDATION', message: 'Your date of birth must be in the past.' },
  });
});

test('a profile update from another origin gets 403 and changes nothing', async () => {
  const { user, cookie } = await loggedInPatient();

  const response = await updateProfile(
    { name: 'Changed Name' },
    cookie,
    'https://other-site.example',
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' },
  });

  const stored = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  expect(stored.name).toBe('Test Patient');
});

test('a profile update that is not JSON gets 415', async () => {
  const { cookie } = await loggedInPatient();
  const request = new NextRequest(new URL('/api/auth/profile', process.env.APP_ORIGIN), {
    method: 'PATCH',
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'text/plain', cookie },
    body: 'name=Changed',
  });

  const response = await PATCH(request);
  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ error: { code: 'JSON_ONLY', message: 'Send JSON.' } });
});
