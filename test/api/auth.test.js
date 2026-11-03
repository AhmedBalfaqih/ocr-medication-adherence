import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, expect, test } from 'vitest';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { prisma } from '@/lib/prisma';
import { todayIn } from '@/lib/time';
import { createPatient, loginAs, makeRequest } from '../helpers';

const LOGIN_FAILED_BODY = {
  error: { code: 'LOGIN_FAILED', message: 'Email or password is incorrect.' },
};

afterAll(async () => {
  await prisma.$disconnect();
});

function uniqueEmail() {
  return `register-${randomUUID()}@example.com`;
}

function registerRequest(body, origin) {
  return makeRequest('/api/auth/register', { method: 'POST', body, origin });
}

function loginRequest(email, password, origin) {
  return makeRequest('/api/auth/login', { method: 'POST', body: { email, password }, origin });
}

function textRequest(path) {
  return new NextRequest(new URL(path, process.env.APP_ORIGIN), {
    method: 'POST',
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'text/plain' },
    body: 'hello',
  });
}

test('register creates a patient, hashes the password and sets the session cookie', async () => {
  const email = uniqueEmail();
  const response = await register(
    registerRequest({ name: 'New Patient', email, password: 'a-good-password' }),
  );

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    id: expect.any(Number),
    name: 'New Patient',
    role: 'PATIENT',
  });
  expect(response.cookies.get('session')).toMatchObject({
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 604800,
  });

  const stored = await prisma.user.findUnique({
    where: { email },
    select: { role: true, status: true, passwordHash: true },
  });
  expect(stored.role).toBe('PATIENT');
  expect(stored.status).toBe('ACTIVE');
  // bcrypt with cost 12, never the plain password
  expect(stored.passwordHash.startsWith('$2b$12$')).toBe(true);
});

test('register then login sets an httpOnly, SameSite Lax cookie on path /', async () => {
  const email = uniqueEmail();
  await register(registerRequest({ name: 'New Patient', email, password: 'a-good-password' }));

  const response = await login(loginRequest(email, 'a-good-password'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    id: expect.any(Number),
    name: 'New Patient',
    role: 'PATIENT',
  });

  const cookie = response.cookies.get('session');
  expect(cookie.value).not.toBe('');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 604800 });
  const header = response.headers.get('set-cookie');
  expect(header).toContain('HttpOnly');
  expect(header).toContain('SameSite=lax');
  expect(header).toContain('Path=/');

  const meResponse = await me(makeRequest('/api/auth/me', { cookie: `session=${cookie.value}` }));
  expect(meResponse.status).toBe(200);
  expect((await meResponse.json()).email).toBe(email);
});

test('login works however the email is typed', async () => {
  const { email, password } = await createPatient();
  const response = await login(loginRequest(email.toUpperCase(), password));
  expect(response.status).toBe(200);
});

test('a taken email gets 409, whatever its case', async () => {
  const email = uniqueEmail();
  const first = await register(
    registerRequest({ name: 'First Patient', email, password: 'a-good-password' }),
  );
  expect(first.status).toBe(201);

  const again = await register(
    registerRequest({ name: 'Second Patient', email, password: 'another-password' }),
  );
  expect(again.status).toBe(409);
  expect(await again.json()).toEqual({
    error: { code: 'EMAIL_TAKEN', message: 'That email is already registered.' },
  });
  expect(again.cookies.get('session')).toBeUndefined();

  const upperCase = await register(
    registerRequest({ name: 'Third Patient', email: email.toUpperCase(), password: 'a-password' }),
  );
  expect(upperCase.status).toBe(409);
});

test('register ignores a role or status in the body', async () => {
  const email = uniqueEmail();
  const response = await register(
    registerRequest({
      name: 'Sneaky Patient',
      email,
      password: 'a-good-password',
      role: 'ADMIN',
      status: 'SUSPENDED',
    }),
  );

  expect(response.status).toBe(201);
  expect((await response.json()).role).toBe('PATIENT');
  const stored = await prisma.user.findUnique({
    where: { email },
    select: { role: true, status: true },
  });
  expect(stored).toEqual({ role: 'PATIENT', status: 'ACTIVE' });
});

test('register rejects a 7 character password and accepts 8 and 72', async () => {
  const short = await register(
    registerRequest({ name: 'New Patient', email: uniqueEmail(), password: 'a'.repeat(7) }),
  );
  expect(short.status).toBe(400);
  expect(await short.json()).toEqual({
    error: {
      code: 'VALIDATION',
      message: 'Please use at least 8 characters for your password.',
    },
  });

  const eight = await register(
    registerRequest({ name: 'New Patient', email: uniqueEmail(), password: 'a'.repeat(8) }),
  );
  expect(eight.status).toBe(201);

  const longest = await register(
    registerRequest({ name: 'New Patient', email: uniqueEmail(), password: 'a'.repeat(72) }),
  );
  expect(longest.status).toBe(201);
});

test('an unknown email and a wrong password get the same 401', async () => {
  const { email } = await createPatient();

  const wrongPassword = await login(loginRequest(email, 'wrong-password-1'));
  const unknownEmail = await login(loginRequest(uniqueEmail(), 'test-password-123'));

  expect(wrongPassword.status).toBe(401);
  expect(unknownEmail.status).toBe(401);
  const wrongPasswordBody = await wrongPassword.json();
  const unknownEmailBody = await unknownEmail.json();
  expect(wrongPasswordBody).toEqual(LOGIN_FAILED_BODY);
  expect(unknownEmailBody).toEqual(wrongPasswordBody);
  expect(wrongPassword.cookies.get('session')).toBeUndefined();
  expect(unknownEmail.cookies.get('session')).toBeUndefined();
});

test('a failed login is saved as an event without the email or password', async () => {
  const { user, email } = await createPatient();

  await login(loginRequest(email, 'wrong-password-2'));
  const knownAccount = await prisma.systemEvent.findFirst({
    where: { type: 'LOGIN_FAILED' },
    orderBy: { id: 'desc' },
  });
  expect(knownAccount).toMatchObject({ message: 'A login failed.', userId: user.id });

  const unknownEmail = uniqueEmail();
  await login(loginRequest(unknownEmail, 'wrong-password-3'));
  const unknownAccount = await prisma.systemEvent.findFirst({
    where: { type: 'LOGIN_FAILED' },
    orderBy: { id: 'desc' },
  });
  expect(unknownAccount).toMatchObject({ message: 'A login failed.', userId: null });

  const leaks = await prisma.systemEvent.count({
    where: {
      OR: [
        { message: { contains: email } },
        { message: { contains: unknownEmail } },
        { message: { contains: 'wrong-password' } },
      ],
    },
  });
  expect(leaks).toBe(0);
});

test('a suspended patient cannot log in or use a cookie from before the suspension', async () => {
  const { user, email, password } = await createPatient();
  const cookie = await loginAs(email, password);
  await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

  const loginResponse = await login(loginRequest(email, password));
  expect(loginResponse.status).toBe(401);
  expect(await loginResponse.json()).toEqual(LOGIN_FAILED_BODY);
  expect(loginResponse.cookies.get('session')).toBeUndefined();

  const meResponse = await me(makeRequest('/api/auth/me', { cookie }));
  expect(meResponse.status).toBe(401);
  expect(await meResponse.json()).toEqual({
    error: { code: 'UNAUTHORIZED', message: 'Please log in.' },
  });
});

test('logout clears the cookie with the same options', async () => {
  const { email, password } = await createPatient();
  const cookie = await loginAs(email, password);

  const response = await logout(
    makeRequest('/api/auth/logout', { method: 'POST', body: {}, cookie }),
  );
  expect(response.status).toBe(204);
  expect(response.cookies.get('session')).toMatchObject({
    value: '',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
});

test('logout still works when the session is already gone', async () => {
  const response = await logout(makeRequest('/api/auth/logout', { method: 'POST', body: {} }));
  expect(response.status).toBe(204);
  expect(response.cookies.get('session')).toMatchObject({ value: '', maxAge: 0 });
});

test('me needs a valid session', async () => {
  const noCookie = await me(makeRequest('/api/auth/me'));
  expect(noCookie.status).toBe(401);

  const { email, password } = await createPatient();
  const cookie = await loginAs(email, password);
  const tampered = await me(makeRequest('/api/auth/me', { cookie: `${cookie}x` }));
  expect(tampered.status).toBe(401);
});

test('me returns only the public fields and today in the patient zone', async () => {
  const { user, email, password } = await createPatient();
  const cookie = await loginAs(email, password);

  const before = todayIn('Africa/Cairo');
  const response = await me(makeRequest('/api/auth/me', { cookie }));
  const after = todayIn('Africa/Cairo');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({
    id: user.id,
    name: 'Test Patient',
    email,
    role: 'PATIENT',
    status: 'ACTIVE',
    timezone: 'Africa/Cairo',
    dateOfBirth: null,
    conditions: null,
    today: expect.any(String),
  });
  // Cairo midnight can pass during the request
  expect([before, after]).toContain(body.today);
});

test('the seeded admin can log in and is shown as an admin', async () => {
  const cookie = await loginAs(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const response = await me(makeRequest('/api/auth/me', { cookie }));
  expect(response.status).toBe(200);
  expect((await response.json()).role).toBe('ADMIN');
});

test('a POST from another origin gets 403', async () => {
  const origin = 'https://other-site.example';
  const { email, password } = await createPatient();

  const responses = [
    await register(
      registerRequest(
        { name: 'New Patient', email: uniqueEmail(), password: 'a-password' },
        origin,
      ),
    ),
    await login(loginRequest(email, password, origin)),
    await logout(makeRequest('/api/auth/logout', { method: 'POST', body: {}, origin })),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' },
    });
    expect(response.cookies.get('session')).toBeUndefined();
  }
});

test('a POST that is not JSON gets 415', async () => {
  const responses = [
    await register(textRequest('/api/auth/register')),
    await login(textRequest('/api/auth/login')),
    await logout(textRequest('/api/auth/logout')),
  ];
  for (const response of responses) {
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: { code: 'JSON_ONLY', message: 'Send JSON.' } });
  }
});

test('no auth response contains passwordHash', async () => {
  const email = uniqueEmail();
  const password = 'a-good-password';
  const registered = await register(registerRequest({ name: 'New Patient', email, password }));
  const takenEmail = await register(registerRequest({ name: 'New Patient', email, password }));
  const loggedIn = await login(loginRequest(email, password));
  const failedLogin = await login(loginRequest(email, 'wrong-password-4'));
  const cookie = `session=${loggedIn.cookies.get('session').value}`;
  const profile = await me(makeRequest('/api/auth/me', { cookie }));

  for (const response of [registered, takenEmail, loggedIn, failedLogin, profile]) {
    const text = await response.text();
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('$2b$');
  }
});
