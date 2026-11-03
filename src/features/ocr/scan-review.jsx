'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MedicineForm } from '@/features/medicines/medicine-form';

// Width of the small copy of the photo, in canvas pixels
const THUMBNAIL_WIDTH = 320;

// FR8 UIR5 The photo beside the medicine form, so the patient can compare before saving
export function ScanReview({
  image,
  defaultValues,
  checkFields,
  manual,
  saved,
  onSave,
  onScanAgain,
  onTypeInstead,
}) {
  const thumbnailRef = useRef(null);

  // The photo stays in memory and is drawn on this page only (CIR3)
  useEffect(() => {
    if (!image) return;
    const thumbnail = thumbnailRef.current;
    thumbnail.width = THUMBNAIL_WIDTH;
    thumbnail.height = Math.round((image.height * THUMBNAIL_WIDTH) / image.width);
    thumbnail.getContext('2d').drawImage(image, 0, 0, thumbnail.width, thumbnail.height);
  }, [image]);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      {image && (
        <figure className="flex w-40 shrink-0 flex-col gap-2">
          <canvas
            ref={thumbnailRef}
            role="img"
            aria-label="Your photo of the label"
            className="h-auto w-full rounded-xl border border-border"
          />
          <figcaption className="text-base">Your photo</figcaption>
        </figure>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {/* One form for both modes, so switching to typing keeps what is in the fields */}
        <MedicineForm
          defaultValues={defaultValues}
          submitLabel={manual ? 'Save medicine' : 'Confirm and save'}
          onSubmit={onSave}
          disabled={saved}
          checkDetails={!manual}
          checkFields={checkFields}
        />
        <div className="flex flex-col gap-3">
          {image && (
            <Button variant="outline" size="lg" onClick={onScanAgain} disabled={saved}>
              Scan again
            </Button>
          )}
          {onTypeInstead && (
            <Button variant="outline" size="lg" onClick={onTypeInstead} disabled={saved}>
              Type it myself
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
