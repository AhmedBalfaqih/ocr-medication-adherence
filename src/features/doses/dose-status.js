import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  SkipForwardIcon,
} from '@hugeicons/core-free-icons';

const DAY_AND_DATE = { weekday: 'long', day: 'numeric', month: 'long' };

// Each answer has a word and an icon, so the status never shows by color alone
export const ANSWERS = {
  TAKEN: { word: 'taken', icon: CheckmarkCircle02Icon },
  SKIPPED: { word: 'skipped', icon: SkipForwardIcon },
  MISSED: { word: 'missed', icon: CancelCircleIcon },
};

// DR4 An older dose shows its day, so it is never mistaken for today's
export function describeDoseDay(date, today) {
  if (date === today) return 'Today';
  // The API sends a plain "YYYY-MM-DD" date; read in UTC so the day never moves
  return new Intl.DateTimeFormat('en-GB', { ...DAY_AND_DATE, timeZone: 'UTC' }).format(
    new Date(date),
  );
}
