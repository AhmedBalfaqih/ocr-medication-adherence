'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { profileInput } from '@/lib/schemas/auth';

// FR3 Update the name, date of birth and conditions
export function ProfileForm({ profile }) {
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(profileInput),
    defaultValues: {
      name: profile.name,
      // The API sends a full ISO date; the date input needs YYYY-MM-DD
      dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : '',
      conditions: profile.conditions ?? '',
    },
  });

  async function handleSave(values) {
    setError('');
    setSaved(false);
    try {
      await api('/auth/profile', { method: 'PATCH', body: values });
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSave)} noValidate>
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="profile-name">Name</FieldLabel>
              <Input
                {...field}
                id="profile-name"
                autoComplete="name"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="dateOfBirth"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="profile-date-of-birth">Date of birth (optional)</FieldLabel>
              <Input
                {...field}
                id="profile-date-of-birth"
                type="date"
                autoComplete="bday"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="conditions"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="profile-conditions">Health conditions (optional)</FieldLabel>
              <Textarea {...field} id="profile-conditions" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {error && (
          <p role="alert" className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="shrink-0" />
            Your changes are saved.
          </p>
        )}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          Save changes
        </Button>
      </FieldGroup>
    </form>
  );
}
