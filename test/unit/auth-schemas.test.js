import { expect, test } from 'vitest';
import { loginInput, profileInput, registerInput } from '@/lib/schemas/auth';

function firstMessage(result) {
  return result.error.issues[0].message;
}

function registration(password) {
  return { name: 'Test Patient', email: 'patient@example.com', password };
}

test('a password of 7 or 73 characters is rejected', () => {
  const short = registerInput.safeParse(registration('a'.repeat(7)));
  expect(short.success).toBe(false);
  expect(firstMessage(short)).toBe('Please use at least 8 characters for your password.');

  const long = registerInput.safeParse(registration('a'.repeat(73)));
  expect(long.success).toBe(false);
  expect(firstMessage(long)).toBe('Please use 72 characters or fewer for your password.');
});

test('a password of 8 or 72 characters is accepted', () => {
  expect(registerInput.safeParse(registration('a'.repeat(8))).success).toBe(true);
  expect(registerInput.safeParse(registration('a'.repeat(72))).success).toBe(true);
});

test('registration trims the name, lower cases the email and drops the role', () => {
  const result = registerInput.safeParse({
    name: '  Test Patient  ',
    email: 'Patient@Example.COM',
    password: 'a'.repeat(8),
    role: 'ADMIN',
  });
  expect(result.data).toEqual({
    name: 'Test Patient',
    email: 'patient@example.com',
    password: 'a'.repeat(8),
  });
});

test('registration needs a name and a valid email', () => {
  const noName = registerInput.safeParse({ ...registration('a'.repeat(8)), name: '   ' });
  expect(firstMessage(noName)).toBe('Please enter your name.');

  const badEmail = registerInput.safeParse({
    ...registration('a'.repeat(8)),
    email: 'not-an-email',
  });
  expect(firstMessage(badEmail)).toBe('Please enter a valid email address.');
});

test('login needs a password of 1 to 72 characters', () => {
  const empty = loginInput.safeParse({ email: 'patient@example.com', password: '' });
  expect(firstMessage(empty)).toBe('Please enter your password.');

  const long = loginInput.safeParse({ email: 'patient@example.com', password: 'a'.repeat(73) });
  expect(long.success).toBe(false);

  const result = loginInput.safeParse({ email: 'Patient@Example.com', password: 'a' });
  expect(result.data).toEqual({ email: 'patient@example.com', password: 'a' });
});

test('profile accepts a past date, a blank date and leaves out unknown fields', () => {
  const result = profileInput.safeParse({
    name: 'Test Patient',
    dateOfBirth: '1950-03-14',
    conditions: '  High blood pressure  ',
    role: 'ADMIN',
    email: 'other@example.com',
  });
  expect(result.data).toEqual({
    name: 'Test Patient',
    dateOfBirth: '1950-03-14',
    conditions: 'High blood pressure',
  });

  const blank = profileInput.safeParse({ name: 'Test Patient', dateOfBirth: '', conditions: '' });
  expect(blank.data).toEqual({ name: 'Test Patient', dateOfBirth: '', conditions: '' });
});

test('profile rejects a future date, a badly written date and long conditions', () => {
  const nextYear = `${new Date().getUTCFullYear() + 1}-01-01`;
  const future = profileInput.safeParse({ name: 'Test Patient', dateOfBirth: nextYear });
  expect(firstMessage(future)).toBe('Your date of birth must be in the past.');

  const badDate = profileInput.safeParse({ name: 'Test Patient', dateOfBirth: '14/03/1950' });
  expect(firstMessage(badDate)).toBe('Please enter the date as YYYY-MM-DD.');

  const long = profileInput.safeParse({ name: 'Test Patient', conditions: 'a'.repeat(501) });
  expect(firstMessage(long)).toBe('Please use 500 characters or fewer for your conditions.');
});
