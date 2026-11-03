'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { buttonVariants } from '@/components/ui/button';
import { prepareImage } from '@/features/ocr/prepare-image';

const PHOTO_NOT_OPENED = 'We could not open this photo. Please choose another photo.';

// The file input itself is hidden, so its label shows the same focus ring as a button
const FOCUS_RING =
  'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50';

// The photo is opened in the browser only; it is never sent to the server (CIR3)
async function openPhoto(file) {
  const address = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = address;
    await photo.decode();
    return prepareImage(photo);
  } finally {
    URL.revokeObjectURL(address);
  }
}

// FR6 CIR2 Use a saved photo of the label instead of the live camera
export function ImageUpload({ onImage, primary = false }) {
  const [error, setError] = useState('');

  async function handleChange(event) {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same photo again still works
    event.target.value = '';
    if (!file) return;
    setError('');

    let image;
    try {
      image = await openPhoto(file);
    } catch {
      setError(PHOTO_NOT_OPENED);
      return;
    }
    onImage(image);
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        className={buttonVariants({
          variant: primary ? 'default' : 'outline',
          size: 'lg',
          className: FOCUS_RING,
        })}
      >
        Upload a photo
        {/* No capture setting, so phones offer saved photos as well as the camera (CIR2) */}
        <input type="file" accept="image/*" className="sr-only" onChange={handleChange} />
      </label>
      {error && (
        <p role="alert" className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
