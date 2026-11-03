'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlarmClockIcon, Alert02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Button, buttonVariants } from '@/components/ui/button';
import { useUser } from '@/components/require-user';
import { DoseActions } from '@/features/doses/dose-actions';
import { ANSWERS, describeDoseDay } from '@/features/doses/dose-status';
import { DR6Notice } from '@/features/medicines/dr6-notice';
import { api } from '@/lib/api';

// FR11 NIR3 NIR4 DR4 One dose in large type: log it, or be reminded again in 10 minutes
export default function DosePage() {
  const { reminderId } = useParams();
  const user = useUser();
  const [dose, setDose] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [totals, setTotals] = useState(null);
  const [snoozing, setSnoozing] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [snoozeError, setSnoozeError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // The id comes from the address bar, so it stays one part of the path
        setDose(await api(`/doses/${encodeURIComponent(reminderId)}`));
      } catch (loadError) {
        if (loadError.status === 404) {
          setNotFound(true);
          return;
        }
        setError(loadError.message);
      }
    }
    load();
  }, [reminderId]);

  // NIR4 The answer and the new totals show at once
  function handleAnswered(result) {
    setDose({ ...dose, answer: result.status });
    setTotals(result.totals);
  }

  async function handleSnooze() {
    setSnoozing(true);
    setSnoozeError('');
    try {
      await api(`/doses/${dose.reminderId}/snooze`, { method: 'POST' });
      setSnoozed(true);
    } catch (snoozeFailure) {
      setSnoozing(false);
      setSnoozeError(snoozeFailure.message);
    }
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-6">
        <p role="alert" className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          We could not find this dose.
        </p>
        <Link href="/dashboard" className={buttonVariants({ size: 'lg' })}>
          Back to the dashboard
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-2">
        <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
        {error}
      </p>
    );
  }

  if (!dose) return <p>Loading…</p>;

  const answer = dose.answer ? ANSWERS[dose.answer] : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold wrap-break-word">{dose.medicineName}</h1>
        <p className="text-2xl wrap-break-word">{dose.dosage}</p>
        <p className="text-4xl font-bold">{dose.time}</p>
        <p className="text-lg">{describeDoseDay(dose.date, user.today)}</p>
      </div>

      {answer && (
        <p role="status" className="flex items-center gap-2 text-lg">
          <HugeiconsIcon icon={answer.icon} aria-hidden="true" className="shrink-0" />
          This dose is recorded as {answer.word}.
        </p>
      )}

      {totals && (
        <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
          <h2 id="totals-heading" className="font-heading text-xl font-medium">
            Your totals
          </h2>
          <dl className="flex flex-wrap gap-6">
            <div>
              <dt>Taken</dt>
              <dd className="text-3xl font-bold">{totals.taken}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd className="text-3xl font-bold">{totals.skipped}</dd>
            </div>
            <div>
              <dt>Missed</dt>
              <dd className="text-3xl font-bold">{totals.missed}</dd>
            </div>
          </dl>
          {totals.rate !== null && <p>You have taken {totals.rate}% of your doses so far.</p>}
        </section>
      )}

      {!dose.answer && (
        <div className="flex flex-col gap-3">
          <p className="text-lg">Did you take this dose?</p>
          <DoseActions reminderId={dose.reminderId} onAnswered={handleAnswered} />
        </div>
      )}

      {/* DR7 A missed dose can still be marked taken, which the server allows */}
      {dose.answer === 'MISSED' && (
        <div className="flex flex-col gap-3">
          <p className="text-lg">If you took it after all, press Taken.</p>
          <DoseActions reminderId={dose.reminderId} takenOnly onAnswered={handleAnswered} />
        </div>
      )}

      {!dose.answer && !snoozed && (
        <Button
          variant="secondary"
          size="lg"
          className="sm:self-start"
          onClick={handleSnooze}
          disabled={snoozing}
        >
          <HugeiconsIcon icon={AlarmClockIcon} aria-hidden="true" data-icon="inline-start" />
          Remind me in 10 minutes
        </Button>
      )}
      {!dose.answer && snoozed && (
        <p role="status" className="flex items-center gap-2 text-lg">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="shrink-0" />
          We will remind you again in 10 minutes.
        </p>
      )}
      {!dose.answer && snoozeError && (
        <p role="alert" className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          {snoozeError}
        </p>
      )}

      <DR6Notice />
    </div>
  );
}
