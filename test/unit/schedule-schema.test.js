import { expect, test } from 'vitest';
import { scheduleCreateInput, scheduleUpdateInput } from '@/lib/schemas/schedule';

const TIME_MISSING = 'Please choose a time.';
const FREQUENCY_MISSING = 'Please choose how often.';
const DAYS_MISSING = 'Please choose at least one day.';
const DAY_NOT_VALID = 'Please choose days from Sunday to Saturday.';
const START_MISSING = 'Please choose a start date.';
const END_NOT_VALID = 'Please choose an end date, or leave it empty.';
const END_BEFORE_START = 'The end date cannot be before the start date.';

const NEW_SCHEDULE = {
  medicineId: 3,
  times: ['08:00'],
  frequency: 'DAILY',
  startDate: '2026-11-01',
};
const EDITED_SCHEDULE = { time: '08:00', frequency: 'DAILY', startDate: '2026-11-01' };

function firstIssue(result) {
  const issue = result.error.issues[0];
  return { path: issue.path.join('.'), message: issue.message };
}

function createMessage(fields) {
  const result = scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, ...fields });
  expect(result.success).toBe(false);
  return firstIssue(result).message;
}

function updateMessage(fields) {
  const result = scheduleUpdateInput.safeParse({ ...EDITED_SCHEDULE, ...fields });
  expect(result.success).toBe(false);
  return firstIssue(result).message;
}

test('a new daily schedule gets no days and unknown fields are left out', () => {
  const result = scheduleCreateInput.safeParse({
    ...NEW_SCHEDULE,
    times: ['08:00', '20:00'],
    endDate: '2026-11-30',
    userId: 9,
    id: 5,
  });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({
    medicineId: 3,
    times: ['08:00', '20:00'],
    frequency: 'DAILY',
    daysOfWeek: [],
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  });
});

test('a daily schedule drops any days the form sent', () => {
  const result = scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, daysOfWeek: [1, 3] });
  expect(result.success).toBe(true);
  expect(result.data.daysOfWeek).toEqual([]);
});

test('a schedule on chosen days keeps its days', () => {
  const result = scheduleCreateInput.safeParse({
    ...NEW_SCHEDULE,
    frequency: 'SPECIFIC_DAYS',
    daysOfWeek: [0, 6],
  });
  expect(result.success).toBe(true);
  expect(result.data.daysOfWeek).toEqual([0, 6]);
});

test('UC5 a missing or badly formed time asks for a time', () => {
  for (const times of [undefined, [], ['8:00'], ['24:00'], ['08:60'], ['8am'], [800], '08:00']) {
    expect(createMessage({ times })).toBe(TIME_MISSING);
  }
});

test('times run from 00:00 to 23:59, up to 6 of them, each once', () => {
  const edges = scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, times: ['00:00', '23:59'] });
  expect(edges.success).toBe(true);

  const six = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
  expect(scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, times: six }).success).toBe(true);
  expect(createMessage({ times: [...six, '23:00'] })).toBe('Please choose 6 times or fewer.');

  expect(createMessage({ times: ['08:00', '08:00'] })).toBe('Please choose each time only once.');
});

test('UC5 a missing or unknown frequency asks how often', () => {
  for (const frequency of [undefined, '', 'WEEKLY', 'daily']) {
    expect(createMessage({ frequency })).toBe(FREQUENCY_MISSING);
  }
});

test('UC5 a missing time and frequency asks for the time first', () => {
  const result = scheduleCreateInput.safeParse({ medicineId: 3, startDate: '2026-11-01' });
  expect(result.success).toBe(false);
  expect(result.error.issues.map((issue) => issue.message)).toEqual([
    TIME_MISSING,
    FREQUENCY_MISSING,
  ]);
});

test('UC5 a schedule on chosen days needs at least one day', () => {
  for (const daysOfWeek of [undefined, []]) {
    const result = scheduleCreateInput.safeParse({
      ...NEW_SCHEDULE,
      frequency: 'SPECIFIC_DAYS',
      daysOfWeek,
    });
    expect(result.success).toBe(false);
    expect(firstIssue(result)).toEqual({ path: 'daysOfWeek', message: DAYS_MISSING });
  }
});

test('days run from Sunday (0) to Saturday (6), each once', () => {
  for (const daysOfWeek of [[7], [-1], [1.5], ['1']]) {
    expect(createMessage({ frequency: 'SPECIFIC_DAYS', daysOfWeek })).toBe(DAY_NOT_VALID);
  }
  // A daily schedule still has its days checked before they are dropped
  expect(createMessage({ daysOfWeek: [7] })).toBe(DAY_NOT_VALID);
  expect(createMessage({ frequency: 'SPECIFIC_DAYS', daysOfWeek: [1, 1] })).toBe(
    'Please choose each day only once.',
  );
});

test('the medicine must be a whole positive number that fits the database', () => {
  for (const medicineId of [undefined, null, 0, -1, 1.5, '3', 2147483648]) {
    expect(createMessage({ medicineId })).toBe('Please choose a medicine.');
  }
  expect(scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, medicineId: 2147483647 }).success).toBe(
    true,
  );
});

test('the start date must be a real calendar date', () => {
  for (const startDate of [undefined, '', '01/11/2026', '2026-02-30', '2026-13-01']) {
    expect(createMessage({ startDate })).toBe(START_MISSING);
  }
  const leapDay = scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, startDate: '2028-02-29' });
  expect(leapDay.success).toBe(true);
});

test('the end date may be empty or missing, but not null or a bad date', () => {
  const empty = scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, endDate: '' });
  expect(empty.success).toBe(true);
  expect(empty.data.endDate).toBe('');

  const missing = scheduleCreateInput.safeParse(NEW_SCHEDULE);
  expect(missing.success).toBe(true);
  expect(missing.data.endDate).toBeUndefined();

  for (const endDate of [null, '2026-13-01', '30/11/2026']) {
    expect(createMessage({ endDate })).toBe(END_NOT_VALID);
  }
});

test('UC5 the end date cannot be before the start date', () => {
  const result = scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, endDate: '2026-10-31' });
  expect(result.success).toBe(false);
  expect(firstIssue(result)).toEqual({ path: 'endDate', message: END_BEFORE_START });

  const sameDay = scheduleCreateInput.safeParse({ ...NEW_SCHEDULE, endDate: '2026-11-01' });
  expect(sameDay.success).toBe(true);
});

test('an edited schedule has one time and no medicine', () => {
  const result = scheduleUpdateInput.safeParse({
    ...EDITED_SCHEDULE,
    frequency: 'SPECIFIC_DAYS',
    daysOfWeek: [2],
    endDate: '',
    medicineId: 4,
    times: ['09:00'],
  });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({
    time: '08:00',
    frequency: 'SPECIFIC_DAYS',
    daysOfWeek: [2],
    startDate: '2026-11-01',
    endDate: '',
  });

  const daily = scheduleUpdateInput.safeParse({ ...EDITED_SCHEDULE, daysOfWeek: [2] });
  expect(daily.data.daysOfWeek).toEqual([]);
});

test('UC5 an edit keeps the same plain messages', () => {
  for (const time of [undefined, '', '8:00', '24:00']) {
    expect(updateMessage({ time })).toBe(TIME_MISSING);
  }
  expect(updateMessage({ frequency: undefined })).toBe(FREQUENCY_MISSING);
  expect(updateMessage({ frequency: 'SPECIFIC_DAYS' })).toBe(DAYS_MISSING);
  expect(updateMessage({ daysOfWeek: [7] })).toBe(DAY_NOT_VALID);
  expect(updateMessage({ startDate: '2026-02-29' })).toBe(START_MISSING);
  expect(updateMessage({ endDate: null })).toBe(END_NOT_VALID);
  expect(updateMessage({ endDate: '2026-10-31' })).toBe(END_BEFORE_START);
});

test('an empty body asks for the medicine first, then the time', () => {
  const created = scheduleCreateInput.safeParse({});
  expect(created.success).toBe(false);
  expect(firstIssue(created).message).toBe('Please choose a medicine.');

  const edited = scheduleUpdateInput.safeParse({});
  expect(edited.success).toBe(false);
  expect(firstIssue(edited).message).toBe(TIME_MISSING);
});
