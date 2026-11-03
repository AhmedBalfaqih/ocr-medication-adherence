import Link from 'next/link';
import { DAY_NAMES } from '@/features/schedules/schedule-form';

const FULL_DATE = { day: 'numeric', month: 'long', year: 'numeric' };
const DAY_AND_DATE = { weekday: 'long', day: 'numeric', month: 'long' };

// The API sends plain "YYYY-MM-DD" dates; read in UTC so the day never moves
function formatDate(dateText, options) {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
    new Date(dateText),
  );
}

function describeDays(schedule) {
  if (schedule.frequency === 'DAILY') return 'Every day';
  const days = [...schedule.daysOfWeek].sort((first, second) => first - second);
  const names = days.map((day) => DAY_NAMES[day]);
  return `On ${new Intl.ListFormat('en-GB').format(names)}`;
}

function describeDates(schedule) {
  const start = formatDate(schedule.startDate, FULL_DATE);
  if (!schedule.endDate) return `From ${start}`;
  return `From ${start} to ${formatDate(schedule.endDate, FULL_DATE)}`;
}

// The server works out the next dose in the patient's zone
function describeNextDose(schedule) {
  if (!schedule.next) return 'No more doses for this time.';
  return `Next dose: ${formatDate(schedule.next.date, DAY_AND_DATE)} at ${schedule.next.time}`;
}

// FR9 DR4 Each dose time shows in large type, with how often and when it runs
export function ScheduleList({ schedules }) {
  return (
    <ul className="flex flex-col gap-3">
      {schedules.map((schedule) => (
        <li key={schedule.id}>
          <Link
            href={`/medicines/${schedule.medicineId}/schedules/${schedule.id}`}
            className="flex min-h-11 flex-col gap-1 rounded-xl border border-border p-4 outline-hidden hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="text-3xl font-bold">{schedule.time}</span>
            <span className="text-lg">{describeDays(schedule)}</span>
            <span>{describeDates(schedule)}</span>
            <span>{describeNextDose(schedule)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
