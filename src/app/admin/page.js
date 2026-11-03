'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { useUser } from '@/components/require-user';
import { AccountList } from '@/features/admin/account-list';
import { api } from '@/lib/api';

// FR14 Manage user accounts: the list, with suspend, activate and remove for patients
export default function AdminPage() {
  const user = useUser();
  const [accounts, setAccounts] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  // Loads again each time loadCount goes up; a slower older load is ignored
  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await api('/admin/users');
        if (ignore) return;
        setAccounts(data);
        setLoadFailed(false);
      } catch {
        if (!ignore) setLoadFailed(true);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [loadCount]);

  function handleTryAgain() {
    setLoadFailed(false);
    setLoadCount((count) => count + 1);
  }

  // The changed account comes back from the API, so only its row changes
  function handleChanged(changed) {
    setAccounts((current) =>
      current.map((account) => (account.id === changed.id ? changed : account)),
    );
  }

  function handleRemoved(removedId) {
    setAccounts((current) => current.filter((account) => account.id !== removedId));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">Accounts</h1>
      {loadFailed && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
            We could not load the accounts. Please try again.
          </p>
          <Button variant="secondary" size="lg" className="sm:self-start" onClick={handleTryAgain}>
            Try again
          </Button>
        </div>
      )}
      {!accounts && !loadFailed && <p>Loading the accounts…</p>}
      {accounts && accounts.length === 0 && <p>There are no accounts yet.</p>}
      {accounts && accounts.length > 0 && (
        <AccountList
          accounts={accounts}
          timeZone={user.timezone}
          onChanged={handleChanged}
          onRemoved={handleRemoved}
        />
      )}
    </div>
  );
}
