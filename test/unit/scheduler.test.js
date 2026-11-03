import { expect, test, vi } from 'vitest';
import { occurrencesBetween } from '@/lib/time';
import { isMissed, pushPayload, windowStart } from '@/services/scheduler';

// Only the rules are tested here, so the database is never touched
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

// Cairo was UTC+2 in early 2024, so 08:00 there is 06:00 UTC
const CAIRO = 'Africa/Cairo';

// Dates come from the database as UTC midnight of the local date
function makeSchedule(fields = {}) {
  return {
    time: '08:00',
    frequency: 'DAILY',
    daysOfWeek: [],
    startDate: new Date('2024-03-01'),
    endDate: null,
    ...fields,
  };
}

function missedAt(schedule, reminderTime, now) {
  return isMissed(schedule, CAIRO, new Date(reminderTime), new Date(now));
}

// The doses a tick at this moment counts, worked out the way the tick does it
function dosesAt(schedule, now) {
  const tick = new Date(now);
  const doses = occurrencesBetween(schedule, CAIRO, windowStart(schedule, tick), tick);
  return doses.map((instant) => instant.toISOString());
}

test('NIR2 a reminder names the medicine, its dose and the local time', () => {
  const reminder = { id: 41, reminderTime: new Date('2024-03-04T06:00:00Z') };
  expect(pushPayload(reminder, { name: 'Testamol', dosage: '500 mg' }, CAIRO)).toEqual({
    reminderId: 41,
    title: 'Testamol',
    body: '500 mg due at 08:00',
    url: '/doses/41',
  });
});

test('a dose skipped by the spring clock change shows the time it was really due', () => {
  // 00:30 on 24 April 2026 never happens in Cairo, so the dose is due when the clock jumps to 01:00
  const reminder = { id: 42, reminderTime: new Date('2026-04-23T22:00:00Z') };
  const payload = pushPayload(reminder, { name: 'Testamol', dosage: '5 mL' }, CAIRO);
  expect(payload.body).toBe('5 mL due at 01:00');
});

test("UC6 a daily dose is missed once the next day's dose is due, not before", () => {
  const schedule = makeSchedule();
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-04T20:00:00Z')).toBe(false);
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-05T05:59:00Z')).toBe(false);
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-05T06:00:00Z')).toBe(true);
});

test('UC6 a dose on chosen days waits for the next chosen day', () => {
  // Monday 4 March 2024; 1 is Monday and 4 is Thursday
  const schedule = makeSchedule({ frequency: 'SPECIFIC_DAYS', daysOfWeek: [1, 4] });
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-06T12:00:00Z')).toBe(false);
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-07T06:00:00Z')).toBe(true);
});

test('UC6 the last dose of an ended schedule is missed when the next would have been due', () => {
  const schedule = makeSchedule({ endDate: new Date('2024-03-04') });
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-04T20:00:00Z')).toBe(false);
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-05T06:00:00Z')).toBe(true);
});

test('UC6 on the spring clock change the next dose comes an hour sooner in UTC', () => {
  // 08:00 in Cairo is 06:00 UTC on 23 April 2026 and 05:00 UTC on 24 April
  const schedule = makeSchedule({ startDate: new Date('2026-04-01') });
  expect(missedAt(schedule, '2026-04-23T06:00:00Z', '2026-04-24T04:59:00Z')).toBe(false);
  expect(missedAt(schedule, '2026-04-23T06:00:00Z', '2026-04-24T05:00:00Z')).toBe(true);
});

test('UC6 after a time change the old dose waits for the next dose at the new time', () => {
  // The 08:00 dose of 4 March, after the patient moved the time to 21:30
  const schedule = makeSchedule({ time: '21:30' });
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-04T19:29:00Z')).toBe(false);
  expect(missedAt(schedule, '2024-03-04T06:00:00Z', '2024-03-04T19:30:00Z')).toBe(true);
});

test('FR10 the tick counts from the last save, or from 24 hours back when the save is older', () => {
  const now = new Date('2024-03-04T12:00:00Z');
  const savedAnHourAgo = makeSchedule({ updatedAt: new Date('2024-03-04T11:00:00Z') });
  expect(windowStart(savedAnHourAgo, now)).toEqual(new Date('2024-03-04T11:00:00Z'));
  const savedDaysAgo = makeSchedule({ updatedAt: new Date('2024-03-01T00:00:00Z') });
  expect(windowStart(savedDaysAgo, now)).toEqual(new Date('2024-03-03T12:00:00Z'));
});

test('FR10 a dose time already past today when it is saved starts tomorrow', () => {
  // Saved at 14:00 in Cairo on 4 March
  const savedAt = new Date('2024-03-04T12:00:00Z');
  const morning = makeSchedule({ updatedAt: savedAt });
  expect(dosesAt(morning, '2024-03-04T21:59:00Z')).toEqual([]);
  expect(dosesAt(morning, '2024-03-05T06:00:00Z')).toEqual(['2024-03-05T06:00:00.000Z']);

  // A time still to come that day is due the same day
  const afternoon = makeSchedule({ time: '16:00', updatedAt: savedAt });
  expect(dosesAt(afternoon, '2024-03-04T14:00:00Z')).toEqual(['2024-03-04T14:00:00.000Z']);
});

test('FR10 on the spring clock change a save counts from its own moment', () => {
  // 00:30 on 24 April 2026 is due at the jump, 22:00 UTC; saved at 23:45 on 23 April, UTC+2
  const savedBefore = makeSchedule({ time: '00:30', updatedAt: new Date('2026-04-23T21:45:00Z') });
  expect(dosesAt(savedBefore, '2026-04-23T22:30:00Z')).toEqual(['2026-04-23T22:00:00.000Z']);

  // Saved at 01:10, UTC+3, after the jump, so the first dose is 00:30 the next night
  const savedAfter = makeSchedule({ time: '00:30', updatedAt: new Date('2026-04-23T22:10:00Z') });
  expect(dosesAt(savedAfter, '2026-04-23T22:30:00Z')).toEqual([]);
  expect(dosesAt(savedAfter, '2026-04-24T21:30:00Z')).toEqual(['2026-04-24T21:30:00.000Z']);
});

test('FR10 on the autumn clock change a save counts from its own moment', () => {
  // 23:30 on 29 October 2026 comes first at UTC+3, 20:30 UTC; saved at the first 23:15
  const savedBefore = makeSchedule({ time: '23:30', updatedAt: new Date('2026-10-29T20:15:00Z') });
  expect(dosesAt(savedBefore, '2026-10-29T21:45:00Z')).toEqual(['2026-10-29T20:30:00.000Z']);

  // Saved at the first 23:45; the second 23:30, at UTC+2, is no dose, so the first is the next night
  const savedAfter = makeSchedule({ time: '23:30', updatedAt: new Date('2026-10-29T20:45:00Z') });
  expect(dosesAt(savedAfter, '2026-10-29T21:45:00Z')).toEqual([]);
  expect(dosesAt(savedAfter, '2026-10-30T21:30:00Z')).toEqual(['2026-10-30T21:30:00.000Z']);
});
