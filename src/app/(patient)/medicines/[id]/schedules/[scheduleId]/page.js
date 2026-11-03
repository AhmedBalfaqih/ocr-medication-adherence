'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DeleteScheduleButton } from '@/features/schedules/delete-schedule-button';
import { ScheduleForm } from '@/features/schedules/schedule-form';
import { api } from '@/lib/api';

// FR9 DR7 Change or delete one dose time
export default function SchedulePage() {
  const { id, scheduleId } = useParams();
  const router = useRouter();
  const [medicine, setMedicine] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Both ids come from the address bar, so each stays one part of the path
        const loadedSchedule = await api(`/schedules/${encodeURIComponent(scheduleId)}`);
        const loadedMedicine = await api(`/medicines/${encodeURIComponent(id)}`);
        // A dose time is shown only under its own medicine
        if (loadedSchedule.medicineId !== loadedMedicine.id) {
          setNotFound(true);
          return;
        }
        setSchedule(loadedSchedule);
        setMedicine(loadedMedicine);
      } catch (loadError) {
        if (loadError.status === 404) {
          setNotFound(true);
          return;
        }
        setError(loadError.message);
      }
    }
    load();
  }, [id, scheduleId]);

  // An error here goes back to the form, which shows it by the button
  async function handleSave(values) {
    await api(`/schedules/${schedule.id}`, { method: 'PATCH', body: values });
    // The button stays off while the medicine loads, so a second press saves nothing
    setSaved(true);
    router.replace(`/medicines/${medicine.id}`);
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-6">
        <p role="alert" className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          We could not find this dose time.
        </p>
        <Link
          href={`/medicines/${encodeURIComponent(id)}`}
          className={buttonVariants({ size: 'lg' })}
        >
          Back to your medicine
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

  if (!schedule) return <p>Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium wrap-break-word">
        Change a dose time for {medicine.name}
      </h1>
      <ScheduleForm
        singleTime
        defaultValues={{
          time: schedule.time,
          frequency: schedule.frequency,
          daysOfWeek: schedule.daysOfWeek,
          startDate: schedule.startDate,
          // The form needs text, and a dose time without an end date has null
          endDate: schedule.endDate ?? '',
        }}
        submitLabel="Save changes"
        onSubmit={handleSave}
        disabled={saved}
      />
      <Separator />
      <DeleteScheduleButton scheduleId={schedule.id} medicineId={medicine.id} />
    </div>
  );
}
