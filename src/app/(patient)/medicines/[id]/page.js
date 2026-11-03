'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DeleteMedicineButton } from '@/features/medicines/delete-medicine-button';
import { MedicineForm } from '@/features/medicines/medicine-form';
import { ScheduleList } from '@/features/schedules/schedule-list';
import { api } from '@/lib/api';

// FR4 FR9 DR7 View, correct or delete one medicine, and see its dose times
export default function MedicinePage() {
  const { id } = useParams();
  const [medicine, setMedicine] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [schedules, setSchedules] = useState(null);
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // The id comes from the address bar, so it stays one part of the path
        setMedicine(await api(`/medicines/${encodeURIComponent(id)}`));
      } catch (loadError) {
        if (loadError.status === 404) {
          setNotFound(true);
          return;
        }
        setError(loadError.message);
      }
    }
    load();
  }, [id]);

  // FR9 The dose times load on their own, so a problem there leaves the medicine on screen
  useEffect(() => {
    async function loadSchedules() {
      try {
        setSchedules(await api(`/schedules?medicineId=${encodeURIComponent(id)}`));
      } catch (loadError) {
        setScheduleError(loadError.message);
      }
    }
    loadSchedules();
  }, [id]);

  // An error here goes back to the form, which shows it by the button
  async function handleSave(values) {
    setSaved(false);
    await api(`/medicines/${medicine.id}`, { method: 'PATCH', body: values });
    setMedicine({ ...medicine, ...values });
    setSaved(true);
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-6">
        <p role="alert" className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          We could not find this medicine.
        </p>
        <Link href="/medicines" className={buttonVariants({ size: 'lg' })}>
          Back to your medicines
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

  if (!medicine) return <p>Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium wrap-break-word">{medicine.name}</h1>
      <MedicineForm
        defaultValues={{
          name: medicine.name,
          dosage: medicine.dosage,
          // The form needs text, and a medicine without notes has null
          notes: medicine.notes ?? '',
        }}
        submitLabel="Save changes"
        onSubmit={handleSave}
      />
      {saved && (
        <p role="status" className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="shrink-0" />
          Your changes are saved.
        </p>
      )}
      <Separator />
      <section aria-labelledby="dose-times-heading" className="flex flex-col gap-4">
        <h2 id="dose-times-heading" className="font-heading text-xl font-medium">
          Dose times
        </h2>
        {scheduleError && (
          <p role="alert" className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
            {scheduleError}
          </p>
        )}
        {!schedules && !scheduleError && <p>Loading…</p>}
        {schedules && schedules.length === 0 && <p>No dose times yet.</p>}
        {schedules && schedules.length > 0 && <ScheduleList schedules={schedules} />}
        {schedules && (
          <Link
            href={`/medicines/${medicine.id}/schedules/new`}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            Add dose times
          </Link>
        )}
      </section>
      <Separator />
      <DeleteMedicineButton medicineId={medicine.id} />
    </div>
  );
}
