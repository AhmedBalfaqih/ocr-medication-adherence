import { afterAll, beforeAll, expect, test, vi } from 'vitest';

// Vercel's Node 26 has no global Temporal, so time.js must give the same answers without it
const CAIRO = 'Africa/Cairo';
const HOUR = 60 * 60 * 1000;
const native = Object.getOwnPropertyDescriptor(globalThis, 'Temporal');
let time;

beforeAll(async () => {
  delete globalThis.Temporal;
  // A fresh copy of time.js, loaded while the global is gone
  vi.resetModules();
  time = await import('@/lib/time');
});

afterAll(() => {
  if (native) Object.defineProperty(globalThis, 'Temporal', native);
});

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
  const occurrences = time.occurrencesBetween(schedule, CAIRO, new Date(from), new Date(to));
  return occurrences.map((instant) => instant.toISOString());
}

function nextAfter(schedule, after) {
  return time.nextOccurrenceAfter(schedule, CAIRO, new Date(after))?.toISOString() ?? null;
}

test('the global Temporal is gone while these tests run', () => {
  expect('Temporal' in globalThis).toBe(false);
});

test('without the global, daily doses, the local time and today follow Cairo', () => {
  expect(between(makeSchedule(), '2026-01-10T00:00:00Z', '2026-01-13T00:00:00Z')).toEqual([
    '2026-01-10T06:00:00.000Z',
    '2026-01-11T06:00:00.000Z',
    '2026-01-12T06:00:00.000Z',
  ]);
  const winterNight = new Date('2026-01-15T22:30:00Z');
  expect(time.localDateTime(winterNight, CAIRO)).toEqual({ date: '2026-01-16', time: '00:30' });
  expect(time.todayIn(CAIRO, winterNight)).toBe('2026-01-16');
  expect(time.todayIn('UTC', winterNight)).toBe('2026-01-15');
});

test('without the global, the spring gap dose is due when the clock jumps', () => {
  expect(time.localDateTime(new Date('2026-04-23T22:00:00Z'), CAIRO)).toEqual({
    date: '2026-04-24',
    time: '01:00',
  });
  expect(
    between(makeSchedule({ time: '00:30' }), '2026-04-23T00:00:00Z', '2026-04-25T00:00:00Z'),
  ).toEqual(['2026-04-23T22:00:00.000Z', '2026-04-24T21:30:00.000Z']);
  expect(nextAfter(makeSchedule({ time: '00:30' }), '2026-04-23T12:00:00Z')).toBe(
    '2026-04-23T22:00:00.000Z',
  );
});

test('without the global, the autumn overlap dose is due once, the first time', () => {
  const first = time.localDateTime(new Date('2026-10-29T20:30:00Z'), CAIRO);
  expect(first).toEqual({ date: '2026-10-29', time: '23:30' });
  expect(time.localDateTime(new Date('2026-10-29T21:30:00Z'), CAIRO)).toEqual(first);
  expect(
    between(makeSchedule({ time: '23:30' }), '2026-10-29T00:00:00Z', '2026-10-31T00:00:00Z'),
  ).toEqual(['2026-10-29T20:30:00.000Z', '2026-10-30T21:30:00.000Z']);
});

// Hour by hour across both 2026 clock changes, the package agrees with Node's own Temporal
test.skipIf(!native)(
  'the local time matches the built-in Temporal across both clock changes',
  () => {
    const windows = [
      ['2026-04-22T00:00:00Z', '2026-04-26T00:00:00Z'],
      ['2026-10-28T00:00:00Z', '2026-11-01T00:00:00Z'],
    ];
    for (const [from, to] of windows) {
      for (let at = Date.parse(from); at < Date.parse(to); at += HOUR) {
        const zoned = native.value.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(CAIRO);
        expect(time.localDateTime(new Date(at), CAIRO)).toEqual({
          date: zoned.toPlainDate().toString(),
          time: zoned.toPlainTime().toString({ smallestUnit: 'minute' }),
        });
      }
    }
  },
);
