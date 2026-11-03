'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { useUser } from '@/components/require-user';
import { EventList } from '@/features/admin/event-list';
import { api } from '@/lib/api';

// FR15 Monitor system activity: the newest system events
export default function AdminEventsPage() {
  const user = useUser();
  const [events, setEvents] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  // Loads again each time loadCount goes up; a slower older load is ignored
  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await api('/admin/events');
        if (ignore) return;
        setEvents(data);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-medium">System events</h1>
        <p>This list shows the 50 newest events.</p>
      </div>
      {loadFailed && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
            We could not load the events. Please try again.
          </p>
          <Button variant="secondary" size="lg" className="sm:self-start" onClick={handleTryAgain}>
            Try again
          </Button>
        </div>
      )}
      {!events && !loadFailed && <p>Loading the events…</p>}
      {events && events.length === 0 && <p>No events yet.</p>}
      {events && events.length > 0 && <EventList events={events} timeZone={user.timezone} />}
    </div>
  );
}
