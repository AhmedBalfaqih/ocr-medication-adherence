import { HugeiconsIcon } from '@hugeicons/react';
import { Progress } from '@/components/ui/progress';
import { ANSWERS } from '@/features/doses/dose-status';

// FR12 UIR3 The three totals, then the rate, all counted from the dose logs
export function AdherenceSummary({ totals }) {
  return (
    <section aria-labelledby="adherence-heading" className="flex flex-col gap-4">
      <h2 id="adherence-heading" className="font-heading text-xl font-medium">
        Your adherence
      </h2>
      {/* The same icons as the dose buttons, so each status always looks the same */}
      <dl className="flex flex-wrap gap-x-8 gap-y-4">
        <div>
          <dt className="flex items-center gap-2 text-lg">
            <HugeiconsIcon icon={ANSWERS.TAKEN.icon} aria-hidden="true" className="shrink-0" />
            Taken
          </dt>
          <dd className="text-3xl font-bold">{totals.taken}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-lg">
            <HugeiconsIcon icon={ANSWERS.MISSED.icon} aria-hidden="true" className="shrink-0" />
            Missed
          </dt>
          <dd className="text-3xl font-bold">{totals.missed}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-lg">
            <HugeiconsIcon icon={ANSWERS.SKIPPED.icon} aria-hidden="true" className="shrink-0" />
            Skipped
          </dt>
          <dd className="text-3xl font-bold">{totals.skipped}</dd>
        </div>
      </dl>
      {totals.rate === null && <p className="text-2xl font-bold">No doses logged yet</p>}
      {totals.rate !== null && (
        <>
          <p className="text-3xl font-bold">You have taken {totals.rate}% of your doses so far.</p>
          <Progress value={totals.rate} aria-label="Doses taken so far" />
        </>
      )}
    </section>
  );
}
