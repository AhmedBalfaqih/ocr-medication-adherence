import { HugeiconsIcon } from '@hugeicons/react';
import { ANSWERS, describeDoseDay } from '@/features/doses/dose-status';

// FR12 DR4 Each logged dose with its medicine, day, time and status
export function RecentDoses({ history, today }) {
  return (
    <section aria-labelledby="recent-doses-heading" className="flex flex-col gap-4">
      <h2 id="recent-doses-heading" className="font-heading text-xl font-medium">
        Recent doses
      </h2>
      {history.length === 0 && <p>No doses logged yet.</p>}
      {history.length > 0 && (
        <ul className="flex flex-col gap-3">
          {history.map((dose) => (
            <li key={dose.id} className="flex flex-col gap-1 rounded-xl border border-border p-4">
              <p className="text-2xl font-bold wrap-break-word">{dose.medicineName}</p>
              <p className="text-xl wrap-break-word">{dose.dosage}</p>
              <p className="text-lg">
                {describeDoseDay(dose.date, today)} at {dose.time}
              </p>
              {/* Status as an icon plus a word, never color alone */}
              <p className="flex items-center gap-2 text-lg capitalize">
                <HugeiconsIcon
                  icon={ANSWERS[dose.status].icon}
                  aria-hidden="true"
                  className="shrink-0"
                />
                {ANSWERS[dose.status].word}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
