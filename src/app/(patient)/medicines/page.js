'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { buttonVariants } from '@/components/ui/button';
import { MedicineList } from '@/features/medicines/medicine-list';
import { api } from '@/lib/api';

// FR4 List the patient's medicines, with an empty state that invites the first one
export default function MedicinesPage() {
  const [medicines, setMedicines] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setMedicines(await api('/medicines'));
      } catch (loadError) {
        setError(loadError.message);
      }
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">Your medicines</h1>
      {error && (
        <p role="alert" className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      )}
      {!medicines && !error && <p>Loading…</p>}
      {medicines && (
        <>
          {medicines.length === 0 && <p>You have not added any medicines yet.</p>}
          <div className="flex flex-col gap-3">
            <Link href="/medicines/new" className={buttonVariants({ size: 'lg' })}>
              Add medicine
            </Link>
            {/* FR6 a second way to add one, from a photo of the label */}
            <Link
              href="/medicines/scan"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Scan a label
            </Link>
          </div>
          {medicines.length > 0 && <MedicineList medicines={medicines} />}
        </>
      )}
    </div>
  );
}
