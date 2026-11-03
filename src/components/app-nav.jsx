'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  DashboardSquare01Icon,
  Logout01Icon,
  Medicine02Icon,
  UserGroupIcon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { Button, buttonVariants } from '@/components/ui/button';
import { useUser } from '@/components/require-user';
import { api } from '@/lib/api';

// Each link comes with its screen, so the menu never leads to a missing page
const PATIENT_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: DashboardSquare01Icon },
  { href: '/medicines', label: 'Medicines', icon: Medicine02Icon },
  { href: '/profile', label: 'Profile', icon: UserIcon },
];

const ADMIN_LINKS = [
  { href: '/admin', label: 'Accounts', icon: UserGroupIcon },
  { href: '/admin/events', label: 'Events', icon: Alert02Icon },
];

// At most four items: the links for the role, then Log out
export function AppNav() {
  const user = useUser();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  const links = user?.role === 'ADMIN' ? ADMIN_LINKS : PATIENT_LINKS;

  async function handleLogout() {
    setLoggingOut(true);
    setError('');
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      setLoggingOut(false);
      setError('We could not log you out. Please try again.');
      return;
    }
    // A full page load drops every value kept in memory (FR13), which the router would keep
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  }

  return (
    <header className="mx-auto w-full max-w-2xl p-4">
      <nav aria-label="Main" className="flex flex-wrap gap-2">
        {links.map((link) => {
          const isCurrent = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent ? 'page' : undefined}
              className={buttonVariants({ variant: isCurrent ? 'secondary' : 'ghost', size: 'lg' })}
            >
              <HugeiconsIcon icon={link.icon} aria-hidden="true" data-icon="inline-start" />
              {link.label}
            </Link>
          );
        })}
        <Button variant="ghost" size="lg" onClick={handleLogout} disabled={loggingOut}>
          <HugeiconsIcon icon={Logout01Icon} aria-hidden="true" data-icon="inline-start" />
          Log out
        </Button>
      </nav>
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" />
          {error}
        </p>
      )}
    </header>
  );
}
