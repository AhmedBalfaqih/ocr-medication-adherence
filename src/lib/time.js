// FR9 FR10 Dose times in the patient's zone, with Temporal from temporal-polyfill (server only)
// Never the global: Vercel's Node 26 has none, and tests must run the same code (design change 54)
import { Temporal } from 'temporal-polyfill/implementation';

// The search starts a day early, and a weekly dose that just passed is due again 7 days on
const SEARCH_DAYS = 9;

// A @db.Date column comes back as UTC midnight of the local calendar date
function toPlainDate(date) {
  return Temporal.PlainDate.from(date.toISOString().slice(0, 10));
}

function localDate(instant, timeZone) {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
}

// A day early, in case a skipped local time moved an occurrence to the next day
function firstDateToCheck(schedule, instant, timeZone) {
  const dayBefore = localDate(instant, timeZone).subtract({ days: 1 });
  const startDate = toPlainDate(schedule.startDate);
  if (Temporal.PlainDate.compare(dayBefore, startDate) >= 0) return dayBefore;
  return startDate;
}

function isAfterEnd(schedule, date) {
  if (!schedule.endDate) return false;
  return Temporal.PlainDate.compare(date, toPlainDate(schedule.endDate)) > 0;
}

function isScheduledDay(schedule, date) {
  if (schedule.frequency === 'DAILY') return true;
  // Temporal counts Monday as 1 and Sunday as 7; a schedule counts Sunday as 0
  return schedule.daysOfWeek.includes(date.dayOfWeek % 7);
}

// One local date and "HH:mm" time in the zone, as a UTC Date
function occurrenceAt(date, time, timeZone) {
  const local = date.toPlainDateTime(Temporal.PlainTime.from(time));
  // When the clock goes back the time happens twice; 'earlier' takes the first one
  const zoned = local.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
  if (zoned.toPlainDateTime().equals(local)) return new Date(zoned.epochMilliseconds);
  // The clock skipped this time, so the dose is due the moment the clock jumps forward
  const jump = zoned.getTimeZoneTransition('next');
  return new Date(jump.epochMilliseconds);
}

// Every due instant with from < instant <= to, so windows that touch never repeat one
export function occurrencesBetween(schedule, timeZone, from, to) {
  const occurrences = [];
  const lastDate = localDate(to, timeZone);
  let date = firstDateToCheck(schedule, from, timeZone);
  while (Temporal.PlainDate.compare(date, lastDate) <= 0 && !isAfterEnd(schedule, date)) {
    if (isScheduledDay(schedule, date)) {
      const instant = occurrenceAt(date, schedule.time, timeZone);
      if (instant.getTime() > from.getTime() && instant.getTime() <= to.getTime()) {
        occurrences.push(instant);
      }
    }
    date = date.add({ days: 1 });
  }
  return occurrences;
}

// The first due instant strictly after `after`, or null once the schedule has ended
export function nextOccurrenceAfter(schedule, timeZone, after) {
  let date = firstDateToCheck(schedule, after, timeZone);
  for (let step = 0; step < SEARCH_DAYS; step += 1) {
    if (isAfterEnd(schedule, date)) return null;
    if (isScheduledDay(schedule, date)) {
      const instant = occurrenceAt(date, schedule.time, timeZone);
      if (instant.getTime() > after.getTime()) return instant;
    }
    date = date.add({ days: 1 });
  }
  return null;
}

// The local date and time of an instant, for dose logs and the screens
export function localDateTime(instant, timeZone) {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timeZone,
  );
  return {
    date: zoned.toPlainDate().toString(),
    time: zoned.toPlainTime().toString({ smallestUnit: 'minute' }),
  };
}

// "Today" is the patient's date, not the server's, since Vercel runs in UTC
export function todayIn(timeZone, now = new Date()) {
  return localDate(now, timeZone).toString();
}
