'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { useUser } from '@/components/require-user';
import { DoseActions } from '@/features/doses/dose-actions';
import { ANSWERS, describeDoseDay } from '@/features/doses/dose-status';
import { api } from '@/lib/api';

// FR10 FR11 Doses due now, so each one can be logged even with reminders off or blocked
export function DueList({ onAnswered }) {
  const user = useUser();
  const [doses, setDoses] = useState(null);
  const [error, setError] = useState('');
  const [lastAnswer, setLastAnswer] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setDoses(await api('/doses'));
      } catch (loadError) {
        setError(loadError.message);
      }
    }
    load();
  }, []);

  // NIR4 A logged dose leaves the list at once, and a line says how it was recorded
  function handleAnswered(answeredDose, result) {
    setDoses((current) => current.filter((dose) => dose.reminderId !== answeredDose.reminderId));
    setLastAnswer({ ...answeredDose, status: result.status });
    // The dashboard passes this in to update its totals too
    onAnswered?.(result);
  }

  return (
    <section aria-labelledby="due-now-heading" className="flex flex-col gap-4">
      <h2 id="due-now-heading" className="font-heading text-xl font-medium">
        Due now
      </h2>
      {error && (
        <p role="alert" className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      )}
      {lastAnswer && (
        <p role="status" className="flex items-center gap-2 text-lg wrap-break-word">
          <HugeiconsIcon
            icon={ANSWERS[lastAnswer.status].icon}
            aria-hidden="true"
            className="shrink-0"
          />
          {lastAnswer.medicineName} at {lastAnswer.time} is recorded as{' '}
          {ANSWERS[lastAnswer.status].word}.
        </p>
      )}
      {!doses && !error && <p>Loading…</p>}
      {doses && doses.length === 0 && <p>Nothing is due right now.</p>}
      {doses && doses.length > 0 && (
        <ul className="flex flex-col gap-3">
          {doses.map((dose, index) => (
            <li key={dose.reminderId}>
              <div
                role="group"
                aria-labelledby={`due-dose-${dose.reminderId}`}
                className="flex flex-col gap-4 rounded-xl border border-border p-4"
              >
                <div id={`due-dose-${dose.reminderId}`} className="flex flex-col gap-1">
                  <p className="text-2xl font-bold wrap-break-word">{dose.medicineName}</p>
                  <p className="text-xl wrap-break-word">{dose.dosage}</p>
                  <p className="text-3xl font-bold">{dose.time}</p>
                  <p className="text-lg">{describeDoseDay(dose.date, user.today)}</p>
                </div>
                {/* One primary button per screen, so only the newest dose gets it */}
                <DoseActions
                  reminderId={dose.reminderId}
                  primary={index === 0}
                  onAnswered={(result) => handleAnswered(dose, result)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
