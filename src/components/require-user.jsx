'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const UserContext = createContext(null);

export function useUser() {
  return useContext(UserContext);
}

// Convenience only; every route handler checks the session again
export function RequireUser({ role, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  // Runs again on each screen change, so a saved name or a suspension shows at once
  useEffect(() => {
    async function load() {
      try {
        const me = await api('/auth/me');
        if (me.role !== role) return router.replace(me.role === 'ADMIN' ? '/admin' : '/dashboard');
        setUser(me);
      } catch {
        router.replace('/login');
      }
    }
    load();
  }, [role, router, pathname]);

  // FR13 A page brought back by the Back button after logout checks the session again
  useEffect(() => {
    function handlePageShow(event) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  if (!user) return <p className="p-6">Loading…</p>;
  return <UserContext value={user}>{children}</UserContext>;
}
