import { expect, test } from 'vitest';
import { accountStatusInput } from '@/lib/schemas/admin';

const STATUS_MISSING = 'Please choose Active or Suspended.';

function firstIssue(result) {
  expect(result.success).toBe(false);
  const issue = result.error.issues[0];
  return { path: issue.path.join('.'), message: issue.message };
}

test('both statuses are accepted', () => {
  for (const status of ['ACTIVE', 'SUSPENDED']) {
    const result = accountStatusInput.safeParse({ status });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status });
  }
});

test('a role, a name or an email in the body is left out', () => {
  const result = accountStatusInput.safeParse({
    status: 'ACTIVE',
    role: 'ADMIN',
    name: 'New Name',
    email: 'someone@example.com',
  });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({ status: 'ACTIVE' });
});

test('a missing, empty, lower case or unknown status asks for Active or Suspended', () => {
  const bodies = [
    {},
    { status: '' },
    { status: 'active' },
    { status: 'suspended' },
    { status: 'DELETED' },
    { status: 'PATIENT' },
    { status: null },
    { status: 1 },
    { role: 'ADMIN' },
  ];
  for (const body of bodies) {
    expect(firstIssue(accountStatusInput.safeParse(body))).toEqual({
      path: 'status',
      message: STATUS_MISSING,
    });
  }
});

test('a body that is not an object gets the same message', () => {
  for (const body of [null, undefined, 'SUSPENDED', ['SUSPENDED'], 5]) {
    expect(firstIssue(accountStatusInput.safeParse(body))).toEqual({
      path: '',
      message: STATUS_MISSING,
    });
  }
});
