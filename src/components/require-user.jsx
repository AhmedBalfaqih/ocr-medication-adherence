'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { api, isLoggedOut } from '@/lib/api';

const UserContext = createContext(null);

export function useUser() {
  return useContext(UserContext);
}

// Convenience only; every route handler checks the session again
export function RequireUser({ role, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Runs again on each screen change, so a saved name or a suspension shows at once
  useEffect(() => {
    async function load() {
      try {
        const me = await api('/auth/me');
        if (me.role !== role) return router.replace(me.role === 'ADMIN' ? '/admin' : '/dashboard');
        setCheckFailed(false);
        setUser(me);
      } catch (error) {
        // A server or network fault must never look like a logout
        if (isLoggedOut(error)) return router.replace('/login');
        setCheckFailed(true);
      }
    }
    load();
  }, [role, router, pathname, attempt]);

  // FR13 A page brought back by the Back button after logout checks the session again
  useEffect(() => {
    function handlePageShow(event) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  function handleTryAgain() {
    setCheckFailed(false);
    setAttempt((count) => count + 1);
  }

  if (checkFailed) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p role="alert" className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          We could not check your login. Please try again.
        </p>
        <Button size="lg" className="sm:self-start" onClick={handleTryAgain}>
          Try again
        </Button>
      </div>
    );
  }
  if (!user) return <p className="p-6">Loading…</p>;
  return <UserContext value={user}>{children}</UserContext>;
}
