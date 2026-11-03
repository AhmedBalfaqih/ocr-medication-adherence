'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  SkipForwardIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const ALREADY_RECORDED = 'This dose is already recorded.';

// FR11 NIR3 Log one dose; Taken is the primary button unless the screen already has one
export function DoseActions({ reminderId, takenOnly = false, primary = true, onAnswered }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAnswer(status) {
    setSaving(true);
    setError('');
    try {
      const result = await api(`/doses/${reminderId}`, { method: 'POST', body: { status } });
      // The buttons stay off, so a second press cannot send a second answer
      onAnswered(result);
    } catch (answerError) {
      setSaving(false);
      setError(answerError.status === 409 ? ALREADY_RECORDED : answerError.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant={primary ? 'default' : 'secondary'}
          size="lg"
          onClick={() => handleAnswer('TAKEN')}
          disabled={saving}
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" data-icon="inline-start" />
          Taken
        </Button>
        {!takenOnly && (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => handleAnswer('SKIPPED')}
            disabled={saving}
          >
            <HugeiconsIcon icon={SkipForwardIcon} aria-hidden="true" data-icon="inline-start" />
            Skipped
          </Button>
        )}
        {!takenOnly && (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => handleAnswer('MISSED')}
            disabled={saving}
          >
            <HugeiconsIcon icon={CancelCircleIcon} aria-hidden="true" data-icon="inline-start" />
            Missed
          </Button>
        )}
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
