'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { loginInput } from '@/lib/schemas/auth';

// FR2 Log in with email and password (UC2)
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const form = useForm({
    resolver: zodResolver(loginInput),
    defaultValues: { email: '', password: '' },
  });

  async function handleLogin(values) {
    setError('');
    try {
      const user = await api('/auth/login', { method: 'POST', body: values });
      router.replace(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleLogin)} noValidate>
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-email">Email</FieldLabel>
              <Input
                {...field}
                id="login-email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                {...field}
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
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
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          Log in
        </Button>
      </FieldGroup>
    </form>
  );
}
