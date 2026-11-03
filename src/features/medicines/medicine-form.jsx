'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DR6Notice } from '@/features/medicines/dr6-notice';
import { medicineInput } from '@/lib/schemas/medicine';

const EMPTY_MEDICINE = { name: '', dosage: '', notes: '' };
const NO_CHECKS = { name: false, dosage: false };

// FR5 FR8 UIR2 UIR5 One medicine form for typed details and for details read from a label
export function MedicineForm({
  defaultValues = EMPTY_MEDICINE,
  submitLabel,
  onSubmit,
  disabled = false,
  checkDetails = false,
  checkFields = NO_CHECKS,
}) {
  const [error, setError] = useState('');
  const form = useForm({
    resolver: zodResolver(medicineInput),
    defaultValues,
  });

  async function handleSave(values) {
    setError('');
    try {
      await onSubmit(values);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    // Only a press on the button saves; Enter in a field never does (CIR5)
    <form onSubmit={(event) => event.preventDefault()} noValidate>
      <FieldGroup>
        {/* CIR4 details read from a label are a draft until the patient checks them */}
        {checkDetails && (
          <p className="flex items-start gap-2 text-base">
            <HugeiconsIcon icon={ViewIcon} aria-hidden="true" className="mt-0.5 shrink-0" />
            Check these details against the label before you save.
          </p>
        )}
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="medicine-name">
                Name
                {checkDetails && checkFields.name && (
                  <span className="flex items-center gap-1 font-normal">
                    <HugeiconsIcon icon={ViewIcon} aria-hidden="true" className="shrink-0" />
                    Please check this
                  </span>
                )}
              </FieldLabel>
              <Input
                {...field}
                id="medicine-name"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="dosage"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="medicine-dosage">
                Dose
                {checkDetails && checkFields.dosage && (
                  <span className="flex items-center gap-1 font-normal">
                    <HugeiconsIcon icon={ViewIcon} aria-hidden="true" className="shrink-0" />
                    Please check this
                  </span>
                )}
              </FieldLabel>
              <Input
                {...field}
                id="medicine-dosage"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="notes"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="medicine-notes">Notes (optional)</FieldLabel>
              <Textarea {...field} id="medicine-notes" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <DR6Notice />
        {error && (
          <p role="alert" className="flex items-center gap-2 text-base">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          onClick={form.handleSubmit(handleSave)}
          disabled={form.formState.isSubmitting || disabled}
        >
          {submitLabel}
        </Button>
      </FieldGroup>
    </form>
  );
}
