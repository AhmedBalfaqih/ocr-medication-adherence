import { expect, test } from 'vitest';
import { localDateTime, nextOccurrenceAfter, occurrencesBetween, todayIn } from '@/lib/time';

// Cairo is UTC+2 in winter and UTC+3 from 24 April to 29 October 2026
const CAIRO = 'Africa/Cairo';
const HOUR = 60 * 60 * 1000;

// Dates come from the database as UTC midnight of the local date
function makeSchedule(fields = {}) {
  return {
    time: '08:00',
    frequency: 'DAILY',
    daysOfWeek: [],
    startDate: new Date('2026-01-01'),
    endDate: null,
    ...fields,
  };
}

function between(schedule, from, to) {
  const occurrences = occurrencesBetween(schedule, CAIRO, new Date(from), new Date(to));
  return occurrences.map((instant) => instant.toISOString());
}

function nextAfter(schedule, after) {
  return nextOccurrenceAfter(schedule, CAIRO, new Date(after))?.toISOString() ?? null;
}

test('a daily schedule is due once a day at its local time', () => {
  expect(between(makeSchedule(), '2026-01-10T00:00:00Z', '2026-01-13T00:00:00Z')).toEqual([
    '2026-01-10T06:00:00.000Z',
    '2026-01-11T06:00:00.000Z',
    '2026-01-12T06:00:00.000Z',
  ]);
});

test('specific days are due only on the chosen weekdays', () => {
  // Sunday 1 March to Sunday 8 March; 1 is Monday and 3 is Wednesday
  const schedule = makeSchedule({ frequency: 'SPECIFIC_DAYS', daysOfWeek: [1, 3] });
  expect(between(schedule, '2026-03-01T00:00:00Z', '2026-03-08T00:00:00Z')).toEqual([
    '2026-03-02T06:00:00.000Z',
    '2026-03-04T06:00:00.000Z',
  ]);
});

test('specific days use the weekday in the patient zone, not in UTC', () => {
  // Monday 00:30 in Cairo is still Sunday in UTC
  const schedule = makeSchedule({ time: '00:30', frequency: 'SPECIFIC_DAYS', daysOfWeek: [1] });
  expect(between(schedule, '2026-03-01T00:00:00Z', '2026-03-03T00:00:00Z')).toEqual([
    '2026-03-01T22:30:00.000Z',
  ]);
});

test('the start and end dates are local dates and both days count', () => {
  const lateDose = makeSchedule({
    time: '23:30',
    startDate: new Date('2026-02-10'),
    endDate: new Date('2026-02-12'),
  });
  expect(between(lateDose, '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z')).toEqual([
    '2026-02-10T21:30:00.000Z',
    '2026-02-11T21:30:00.000Z',
    '2026-02-12T21:30:00.000Z',
  ]);

  // 01:00 on 10 February in Cairo is still 9 February in UTC
  const earlyDose = makeSchedule({
    time: '01:00',
    startDate: new Date('2026-02-10'),
    endDate: new Date('2026-02-10'),
  });
  expect(between(earlyDose, '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z')).toEqual([
    '2026-02-09T23:00:00.000Z',
  ]);
});

test('the zone data has the 2026 Cairo clock changes this file expects', () => {
  // Spring: 00:00 to 00:59 on 24 April never happens
  expect(localDateTime(new Date('2026-04-23T21:59:00Z'), CAIRO)).toEqual({
    date: '2026-04-23',
    time: '23:59',
  });
  expect(localDateTime(new Date('2026-04-23T22:00:00Z'), CAIRO)).toEqual({
    date: '2026-04-24',
    time: '01:00',
  });

  // Autumn: 23:00 to 23:59 on 29 October happens twice
  const first = localDateTime(new Date('2026-10-29T20:30:00Z'), CAIRO);
  const second = localDateTime(new Date('2026-10-29T21:30:00Z'), CAIRO);
  expect(first).toEqual({ date: '2026-10-29', time: '23:30' });
  expect(second).toEqual(first);
});

test('in the spring gap a skipped time is due when the clock jumps forward', () => {
  const schedule = makeSchedule({ time: '00:30' });
  expect(between(schedule, '2026-04-23T00:00:00Z', '2026-04-25T00:00:00Z')).toEqual([
    '2026-04-23T22:00:00.000Z',
    '2026-04-24T21:30:00.000Z',
  ]);

  // A morning dose that day moves to the summer offset
  expect(between(makeSchedule(), '2026-04-23T00:00:00Z', '2026-04-25T00:00:00Z')).toEqual([
    '2026-04-23T06:00:00.000Z',
    '2026-04-24T05:00:00.000Z',
  ]);
});

test('in the autumn overlap a time that happens twice is due once, the first time', () => {
  const schedule = makeSchedule({ time: '23:30' });
  expect(between(schedule, '2026-10-29T00:00:00Z', '2026-10-31T00:00:00Z')).toEqual([
    '2026-10-29T20:30:00.000Z',
    '2026-10-30T21:30:00.000Z',
  ]);

  // A window that holds both 23:30s still gives one dose
  expect(between(schedule, '2026-10-29T12:00:00Z', '2026-10-30T12:00:00Z')).toEqual([
    '2026-10-29T20:30:00.000Z',
  ]);
});

test('the 24 hour catch up window gives each occurrence once', () => {
  const now = new Date('2026-01-15T10:00:00Z');
  const dayBefore = new Date(now.getTime() - 24 * HOUR);
  expect(between(makeSchedule(), dayBefore, now)).toEqual(['2026-01-15T06:00:00.000Z']);

  // The window leaves out its start and keeps its end, so yesterday's dose is not counted again
  const atDose = new Date('2026-01-15T06:00:00Z');
  const dayBeforeDose = new Date(atDose.getTime() - 24 * HOUR);
  expect(between(makeSchedule(), dayBeforeDose, atDose)).toEqual(['2026-01-15T06:00:00.000Z']);
});

test('windows that touch end to end never repeat or drop an occurrence', () => {
  const schedule = makeSchedule({ time: '23:30' });
  const start = new Date('2026-10-27T00:00:00Z').getTime();
  const end = new Date('2026-11-01T00:00:00Z').getTime();
  const fromHourlyWindows = [];
  for (let from = start; from < end; from += HOUR) {
    fromHourlyWindows.push(...between(schedule, from, from + HOUR));
  }
  expect(fromHourlyWindows).toEqual(between(schedule, start, end));
  expect(fromHourlyWindows).toHaveLength(5);
});

test('the next occurrence moves to the next day once today has passed', () => {
  const schedule = makeSchedule();
  expect(nextAfter(schedule, '2026-01-15T05:59:00Z')).toBe('2026-01-15T06:00:00.000Z');
  expect(nextAfter(schedule, '2026-01-15T06:00:00Z')).toBe('2026-01-16T06:00:00.000Z');
  expect(nextAfter(schedule, '2026-01-15T07:00:00Z')).toBe('2026-01-16T06:00:00.000Z');

  // Just after local midnight the next 00:30 dose is the same UTC day
  const nightDose = makeSchedule({ time: '00:30' });
  expect(nextAfter(nightDose, '2026-01-15T22:00:00Z')).toBe('2026-01-15T22:30:00.000Z');
});

test('the next occurrence of a weekly dose that just passed is a week later', () => {
  // Thursday 15 January, 09:00 in Cairo; 4 is Thursday
  const schedule = makeSchedule({ frequency: 'SPECIFIC_DAYS', daysOfWeek: [4] });
  expect(nextAfter(schedule, '2026-01-15T07:00:00Z')).toBe('2026-01-22T06:00:00.000Z');
});

test('the next occurrence waits for the start date and stops after the end date', () => {
  const later = makeSchedule({ startDate: new Date('2026-06-01') });
  expect(nextAfter(later, '2026-01-01T00:00:00Z')).toBe('2026-06-01T05:00:00.000Z');

  const ended = makeSchedule({ endDate: new Date('2026-01-15') });
  expect(nextAfter(ended, '2026-01-15T05:00:00Z')).toBe('2026-01-15T06:00:00.000Z');
  expect(nextAfter(ended, '2026-01-15T07:00:00Z')).toBeNull();
});

test('the next occurrence in the spring gap is the moment the clock jumps', () => {
  const schedule = makeSchedule({ time: '00:30' });
  expect(nextAfter(schedule, '2026-04-23T12:00:00Z')).toBe('2026-04-23T22:00:00.000Z');
});

test('local date, time and today follow the patient zone across midnight UTC', () => {
  const winterNight = new Date('2026-01-15T22:30:00Z');
  expect(localDateTime(winterNight, CAIRO)).toEqual({ date: '2026-01-16', time: '00:30' });
  expect(todayIn(CAIRO, winterNight)).toBe('2026-01-16');
  expect(todayIn('UTC', winterNight)).toBe('2026-01-15');

  const beforeMidnight = new Date('2026-01-15T21:59:00Z');
  expect(localDateTime(beforeMidnight, CAIRO)).toEqual({ date: '2026-01-15', time: '23:59' });
  expect(todayIn(CAIRO, beforeMidnight)).toBe('2026-01-15');

  const summerNight = new Date('2026-07-01T21:15:00Z');
  expect(localDateTime(summerNight, CAIRO)).toEqual({ date: '2026-07-02', time: '00:15' });
  expect(todayIn(CAIRO, summerNight)).toBe('2026-07-02');
});
