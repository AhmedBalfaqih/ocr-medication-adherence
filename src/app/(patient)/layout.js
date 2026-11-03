'use client';

import { RequireUser } from '@/components/require-user';
import { AppNav } from '@/components/app-nav';
import { ServiceWorker } from '@/components/service-worker';

// Patient screens only; the API checks the role again on every request
export default function PatientLayout({ children }) {
  return (
    <RequireUser role="PATIENT">
      <ServiceWorker />
      <AppNav />
      <main className="mx-auto w-full max-w-2xl p-4">{children}</main>
    </RequireUser>
  );
}
