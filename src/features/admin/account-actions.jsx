'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  UserBlock01Icon,
  UserCheck01Icon,
  UserRemove01Icon,
} from '@hugeicons/core-free-icons';
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

// FR14 Suspend, activate or remove one patient account
export function AccountActions({ account, onChanged, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const isActive = account.status === 'ACTIVE';

  async function handleStatusChange() {
    setBusy(true);
    setError('');
    try {
      const changed = await api(`/admin/users/${account.id}`, {
        method: 'PATCH',
        body: { status: isActive ? 'SUSPENDED' : 'ACTIVE' },
      });
      onChanged(changed);
    } catch (changeError) {
      setError(changeError.message);
    }
    setBusy(false);
  }

  function handleOpenChange(nextOpen) {
    // Escape cannot close the box while the removal runs
    if (busy) return;
    setOpen(nextOpen);
  }

  async function handleRemove() {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${account.id}`, { method: 'DELETE' });
    } catch (removeError) {
      // The box closes so the message shows next to the account
      setBusy(false);
      setOpen(false);
      setError(removeError.message);
      return;
    }
    onRemoved(account.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" size="lg" onClick={handleStatusChange} disabled={busy}>
          <HugeiconsIcon
            icon={isActive ? UserBlock01Icon : UserCheck01Icon}
            aria-hidden="true"
            data-icon="inline-start"
          />
          {isActive ? 'Suspend' : 'Activate'}
        </Button>
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger disabled={busy} render={<Button variant="secondary" size="lg" />}>
            <HugeiconsIcon icon={UserRemove01Icon} aria-hidden="true" data-icon="inline-start" />
            Remove
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this account?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the account of <span className="wrap-break-word">{account.name}</span>{' '}
                and all its medicines and dose history for good.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="lg" disabled={busy}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                size="lg"
                onClick={handleRemove}
                disabled={busy}
              >
                Remove account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
