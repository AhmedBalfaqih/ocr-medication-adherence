import { expect, test, vi } from 'vitest';
import { isMissed, pushPayload } from '@/services/scheduler';

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
