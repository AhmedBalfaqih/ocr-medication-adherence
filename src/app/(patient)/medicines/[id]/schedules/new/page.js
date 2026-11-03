'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { useUser } from '@/components/require-user';
import { buttonVariants } from '@/components/ui/button';
import { ScheduleForm } from '@/features/schedules/schedule-form';
import { api } from '@/lib/api';

// FR9 UC5 Add one or more dose times to a medicine
export default function NewSchedulePage() {
  const { id } = useParams();
  const router = useRouter();
  const user = useUser();
  const [medicine, setMedicine] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

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

  // An error here goes back to the form, which shows it by the button
  async function handleSave(values) {
    await api('/schedules', { method: 'POST', body: values });
    // The button stays off while the medicine loads, so a second press saves nothing
    setSaved(true);
    router.replace(`/medicines/${medicine.id}`);
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
      <h1 className="font-heading text-2xl font-medium wrap-break-word">
        Add dose times for {medicine.name}
      </h1>
      <ScheduleForm
        defaultValues={{
          medicineId: medicine.id,
          // DR2 the patient picks each time and how often; the form never guesses them
          times: [''],
          frequency: '',
          daysOfWeek: [],
          // The server works out today in the patient's zone
          startDate: user.today,
          endDate: '',
        }}
        submitLabel="Save dose times"
        onSubmit={handleSave}
        disabled={saved}
      />
    </div>
  );
}
