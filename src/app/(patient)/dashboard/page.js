'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { useUser } from '@/components/require-user';
import { AdherenceSummary } from '@/features/dashboard/adherence-summary';
import { EmptyDashboard } from '@/features/dashboard/empty-dashboard';
import { RecentDoses } from '@/features/dashboard/recent-doses';
import { DueList } from '@/features/doses/due-list';
import { DR6Notice } from '@/features/medicines/dr6-notice';
import { api } from '@/lib/api';

// FR10 FR11 FR12 UC7 The dashboard: doses due now, adherence, recent doses and the DR6 notice
export default function DashboardPage() {
  const user = useUser();
  const [dashboard, setDashboard] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  // Loads again each time loadCount goes up; a slower older load is ignored
  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await api('/dashboard');
        if (ignore) return;
        setDashboard(data);
        setLoadFailed(false);
      } catch {
        if (!ignore) setLoadFailed(true);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [loadCount]);

  function handleTryAgain() {
    setLoadFailed(false);
    setLoadCount((count) => count + 1);
  }

  // NIR4 The totals change at once, then the reload adds the new log to Recent doses
  function handleAnswered(result) {
    setDashboard((current) => (current ? { ...current, totals: result.totals } : null));
    setLoadCount((count) => count + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">Welcome, {user.name}</h1>
      <DueList onAnswered={handleAnswered} />
      {loadFailed && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
            We could not load your adherence. Please try again.
          </p>
          <Button variant="secondary" size="lg" className="sm:self-start" onClick={handleTryAgain}>
            Try again
          </Button>
        </div>
      )}
      {!dashboard && !loadFailed && <p>Loading your adherence…</p>}
      {dashboard && dashboard.medicineCount === 0 && <EmptyDashboard />}
      {dashboard && dashboard.medicineCount > 0 && (
        <>
          <AdherenceSummary totals={dashboard.totals} />
          <RecentDoses history={dashboard.history} today={user.today} />
        </>
      )}
      <DR6Notice />
    </div>
  );
}
