'use client';

import { RequireUser } from '@/components/require-user';
import { AppNav } from '@/components/app-nav';

// Admin screens only; the API checks the role again on every request
export default function AdminLayout({ children }) {
  return (
    <RequireUser role="ADMIN">
      <AppNav />
      <main className="mx-auto w-full max-w-2xl p-4">{children}</main>
    </RequireUser>
  );
}
