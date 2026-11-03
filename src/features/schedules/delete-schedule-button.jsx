'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

// FR9 DR7 Remove a dose time only after the patient confirms
export function DeleteScheduleButton({ scheduleId, medicineId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  function handleOpenChange(nextOpen) {
    // Escape cannot close the box while a delete runs, so its result is always seen
    if (deleting) return;
    setOpen(nextOpen);
    // A box opened again starts without the last error
    setError('');
  }

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api(`/schedules/${scheduleId}`, { method: 'DELETE' });
    } catch (deleteError) {
      setDeleting(false);
      setError(deleteError.message);
      return;
    }
    router.replace(`/medicines/${medicineId}`);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={<Button variant="destructive" size="lg" className="self-start" />}
      >
        Delete this time
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this dose time?</AlertDialogTitle>
          <AlertDialogDescription>
            Its reminders and dose history are removed too.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel size="lg" disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            size="lg"
            onClick={handleDelete}
            disabled={deleting}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
