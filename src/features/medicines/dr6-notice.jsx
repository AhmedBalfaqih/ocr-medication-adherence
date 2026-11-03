import { HugeiconsIcon } from '@hugeicons/react';
import { InformationCircleIcon } from '@hugeicons/core-free-icons';

// DR6 Medical decisions stay with the doctor or pharmacist
export function DR6Notice() {
  return (
    <p className="flex items-start gap-2 text-base">
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="mt-0.5 shrink-0" />
      This app does not give medical advice. Check any change to your medicines with your doctor or
      pharmacist.
    </p>
  );
}
