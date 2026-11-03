import { z } from 'zod';

const MEDICINE_MISSING = 'Please choose a medicine.';
const TIME_MISSING = 'Please choose a time.';
const FREQUENCY_MISSING = 'Please choose how often.';
const DAY_NOT_VALID = 'Please choose days from Sunday to Saturday.';
const DAYS_MISSING = 'Please choose at least one day.';
const START_MISSING = 'Please choose a start date.';
const END_NOT_VALID = 'Please choose an end date, or leave it empty.';
const END_BEFORE_START = 'The end date cannot be before the start date.';

// "HH:mm" on the 24 hour clock, 00:00 to 23:59
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isUnique(values) {
  return new Set(values).size === values.length;
}

// A positive Postgres integer id, so a huge number never reaches the database
const medicineId = z.int32(MEDICINE_MISSING).positive(MEDICINE_MISSING);

const time = z.string(TIME_MISSING).regex(TIME_PATTERN, TIME_MISSING);

// "Twice a day" is two times, and each time becomes its own schedule row
const times = z
  .array(time, TIME_MISSING)
  .min(1, TIME_MISSING)
  .max(6, 'Please choose 6 times or fewer.')
  .refine(isUnique, 'Please choose each time only once.');

const frequency = z.enum(['DAILY', 'SPECIFIC_DAYS'], FREQUENCY_MISSING);

// 0 is Sunday and 6 is Saturday, as in the database
const day = z.int(DAY_NOT_VALID).min(0, DAY_NOT_VALID).max(6, DAY_NOT_VALID);

const daysOfWeek = z
  .array(day, DAY_NOT_VALID)
  .refine(isUnique, 'Please choose each day only once.')
  .default([]);

const startDate = z.iso.date(START_MISSING);

// An empty string means the schedule has no end date
const endDate = z.union([z.literal(''), z.iso.date(END_NOT_VALID)], END_NOT_VALID).optional();

// UC5 a schedule on chosen days needs at least one day
function hasDaysWhenNeeded(schedule) {
  return schedule.frequency === 'DAILY' || schedule.daysOfWeek.length > 0;
}

// ISO dates sort as text, so a plain comparison is enough
function endsOnOrAfterStart(schedule) {
  return !schedule.endDate || schedule.endDate >= schedule.startDate;
}

// A daily schedule keeps no days, whatever the form sent
function clearDaysWhenDaily(schedule) {
  if (schedule.frequency === 'DAILY') return { ...schedule, daysOfWeek: [] };
  return schedule;
}

// FR9 Create schedules for one medicine, one row per time
export const scheduleCreateInput = z
  .object({ medicineId, times, frequency, daysOfWeek, startDate, endDate })
  .refine(hasDaysWhenNeeded, { error: DAYS_MISSING, path: ['daysOfWeek'] })
  .refine(endsOnOrAfterStart, { error: END_BEFORE_START, path: ['endDate'] })
  .transform(clearDaysWhenDaily);

// FR9 Edit one schedule; it stays with its medicine
export const scheduleUpdateInput = z
  .object({ time, frequency, daysOfWeek, startDate, endDate })
  .refine(hasDaysWhenNeeded, { error: DAYS_MISSING, path: ['daysOfWeek'] })
  .refine(endsOnOrAfterStart, { error: END_BEFORE_START, path: ['endDate'] })
  .transform(clearDaysWhenDaily);
