'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Separator } from '@/components/ui/separator';
import { ProfileForm } from '@/features/auth/profile-form';
import { ReminderSettings } from '@/features/reminders/reminder-settings';
import { api } from '@/lib/api';

// FR3 FR10 The profile and the reminders setting; logging out (FR13) is in the nav
export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setProfile(await api('/auth/me'));
      } catch (loadError) {
        setError(loadError.message);
      }
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">Your profile</h1>
      {error && (
        <p role="alert" className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      )}
      {!profile && !error && <p>Loading…</p>}
      {profile && (
        <>
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="font-medium">Email</dt>
              <dd className="wrap-break-word">{profile.email}</dd>
            </div>
            <div>
              <dt className="font-medium">Time zone</dt>
              <dd>{profile.timezone}</dd>
              <dd>Your reminders use this time zone.</dd>
            </div>
          </dl>
          <ProfileForm profile={profile} />
        </>
      )}
      <Separator />
      <ReminderSettings />
    </div>
  );
}
