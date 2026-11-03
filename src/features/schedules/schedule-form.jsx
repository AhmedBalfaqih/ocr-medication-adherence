'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { scheduleCreateInput, scheduleUpdateInput } from '@/lib/schemas/schedule';

// 0 is Sunday, as in the database
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// The same limit as the schema
const MAX_TIMES = 6;

// FR9 UC5 DR2 Dose times for one medicine, saved exactly as the patient chose them
export function ScheduleForm({
  defaultValues,
  submitLabel,
  onSubmit,
  disabled = false,
  singleTime = false,
}) {
  const [error, setError] = useState('');
  const form = useForm({
    // Adding takes a list of times; changing takes one time, as the API does
    resolver: zodResolver(singleTime ? scheduleUpdateInput : scheduleCreateInput),
    defaultValues,
  });
  const frequency = useWatch({ control: form.control, name: 'frequency' });

  async function handleSave(values) {
    setError('');
    try {
      await onSubmit(values);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    // Only a press on the button saves, so Enter never saves a half chosen time
    <form onSubmit={(event) => event.preventDefault()} noValidate>
      <FieldGroup>
        {singleTime && (
          <Controller
            name="time"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="schedule-time">Time</FieldLabel>
                <Input
                  {...field}
                  id="schedule-time"
                  type="time"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}
        {!singleTime && (
          <Controller
            name="times"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldGroup>
                {field.value.map((time, index) => {
                  // A wrong time has its own error; a problem with the whole list does not
                  const timeError = fieldState.error?.[index];
                  return (
                    <Field key={index} data-invalid={Boolean(timeError)}>
                      <FieldLabel htmlFor={`schedule-time-${index}`}>
                        {field.value.length === 1 ? 'Time' : `Time ${index + 1}`}
                      </FieldLabel>
                      <div className="flex items-center gap-2">
                        <Input
                          ref={index === 0 ? field.ref : undefined}
                          id={`schedule-time-${index}`}
                          type="time"
                          value={time}
                          onChange={(event) => {
                            const times = [...field.value];
                            times[index] = event.target.value;
                            field.onChange(times);
                          }}
                          onBlur={field.onBlur}
                          aria-invalid={Boolean(timeError)}
                        />
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            aria-label={`Remove time ${index + 1}`}
                            onClick={() =>
                              field.onChange(
                                field.value.filter((kept, position) => position !== index),
                              )
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      {timeError && <FieldError errors={[timeError]} />}
                    </Field>
                  );
                })}
                {fieldState.error?.message && <FieldError errors={[fieldState.error]} />}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="self-start"
                  onClick={() => field.onChange([...field.value, ''])}
                  disabled={field.value.length >= MAX_TIMES}
                >
                  Add another time
                </Button>
                {field.value.length >= MAX_TIMES && (
                  <p>You can add up to {MAX_TIMES} times at once.</p>
                )}
              </FieldGroup>
            )}
          />
        )}
        <Controller
          name="frequency"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldSet>
              <FieldLegend id="schedule-frequency-legend">How often</FieldLegend>
              <RadioGroup
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                aria-labelledby="schedule-frequency-legend"
              >
                <FieldLabel htmlFor="schedule-every-day">
                  <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                    <RadioGroupItem
                      value="DAILY"
                      id="schedule-every-day"
                      aria-invalid={fieldState.invalid}
                    />
                    Every day
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="schedule-some-days">
                  <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                    <RadioGroupItem
                      value="SPECIFIC_DAYS"
                      id="schedule-some-days"
                      aria-invalid={fieldState.invalid}
                    />
                    Only on some days
                  </Field>
                </FieldLabel>
              </RadioGroup>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </FieldSet>
          )}
        />
        {frequency === 'SPECIFIC_DAYS' && (
          <Controller
            name="daysOfWeek"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldSet>
                <FieldLegend>Which days</FieldLegend>
                <FieldGroup data-slot="checkbox-group">
                  {DAY_NAMES.map((dayName, day) => (
                    <FieldLabel key={dayName} htmlFor={`schedule-day-${day}`}>
                      <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                        <Checkbox
                          id={`schedule-day-${day}`}
                          name={field.name}
                          checked={field.value.includes(day)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              field.onChange([...field.value, day]);
                              return;
                            }
                            field.onChange(field.value.filter((chosen) => chosen !== day));
                          }}
                          aria-invalid={fieldState.invalid}
                        />
                        {dayName}
                      </Field>
                    </FieldLabel>
                  ))}
                </FieldGroup>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </FieldSet>
            )}
          />
        )}
        <Controller
          name="startDate"
          control={form.control}
          // A new start date can fix or break the end date check, so it runs again
          rules={{ deps: ['endDate'] }}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="schedule-start-date">Start date</FieldLabel>
              <Input
                {...field}
                id="schedule-start-date"
                type="date"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="endDate"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="schedule-end-date">End date (optional)</FieldLabel>
              <Input
                {...field}
                id="schedule-end-date"
                type="date"
                aria-describedby="schedule-end-date-hint"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription id="schedule-end-date-hint">
                Leave this empty if there is no end date.
              </FieldDescription>
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
