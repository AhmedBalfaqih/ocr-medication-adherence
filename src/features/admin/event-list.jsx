import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  InformationCircleIcon,
  LockPasswordIcon,
  NotificationOff01Icon,
  UserBlock01Icon,
  UserCheck01Icon,
  UserRemove01Icon,
} from '@hugeicons/core-free-icons';

// Each event type shows in words with an icon, never as a code
const EVENT_TYPES = {
  LOGIN_FAILED: { words: 'Login failed', icon: LockPasswordIcon },
  TICK_FAILED: { words: 'Reminder check failed', icon: Alert02Icon },
  PUSH_FAILED: { words: 'Reminder not delivered', icon: NotificationOff01Icon },
  ACCOUNT_SUSPENDED: { words: 'Account suspended', icon: UserBlock01Icon },
  ACCOUNT_ACTIVATED: { words: 'Account activated', icon: UserCheck01Icon },
  ACCOUNT_REMOVED: { words: 'Account removed', icon: UserRemove01Icon },
};

// A type this list does not know still shows, as it is stored
function describeType(type) {
  return EVENT_TYPES[type] ?? { words: type, icon: InformationCircleIcon };
}

// The date and time of the event, in the admin's own zone
function formatEventTime(createdAt, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(createdAt));
}

// FR15 Each system event with its type, message, account email and time
export function EventList({ events, timeZone }) {
  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => {
        const type = describeType(event.type);
        return (
          <li key={event.id} className="flex flex-col gap-1 rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-xl font-bold">
              <HugeiconsIcon icon={type.icon} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 wrap-break-word">{type.words}</span>
            </p>
            <p className="wrap-break-word">{event.message}</p>
            {event.email && <p className="wrap-break-word">Account: {event.email}</p>}
            <p>
              <time dateTime={event.createdAt}>{formatEventTime(event.createdAt, timeZone)}</time>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
