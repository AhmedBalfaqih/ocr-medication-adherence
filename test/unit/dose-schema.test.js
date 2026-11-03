import { expect, test } from 'vitest';
import { doseAnswerInput } from '@/lib/schemas/dose';

const STATUS_MISSING = 'Please choose Taken, Skipped or Missed.';

function firstIssue(result) {
  expect(result.success).toBe(false);
  const issue = result.error.issues[0];
  return { path: issue.path.join('.'), message: issue.message };
}

test('each of the three answers is accepted and unknown fields are left out', () => {
  for (const status of ['TAKEN', 'SKIPPED', 'MISSED']) {
    const result = doseAnswerInput.safeParse({ status, reminderId: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status });
  }
});

test('a missing, lower case or reminder status answer asks the patient to choose', () => {
  for (const body of [{}, { status: '' }, { status: 'taken' }, { status: 'PENDING' }]) {
    expect(firstIssue(doseAnswerInput.safeParse(body))).toEqual({
      path: 'status',
      message: STATUS_MISSING,
    });
  }
});
