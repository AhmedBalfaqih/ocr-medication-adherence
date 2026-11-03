'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { ImageUpload } from '@/features/ocr/image-upload';
import { prepareImage } from '@/features/ocr/prepare-image';
import { useCamera } from '@/features/ocr/use-camera';

// FR6 CIR1 Take one photo of the label with the device camera
export function CameraCapture({ onCapture, onCancel, onTypeInstead }) {
  const { videoRef, error, stopCamera } = useCamera();
  const [hasPicture, setHasPicture] = useState(false);

  function handleTakePhoto() {
    // Only the canvas copy is kept; the camera turns off straight away
    const image = prepareImage(videoRef.current);
    stopCamera();
    onCapture(image);
  }

  function handleCancel() {
    stopCamera();
    onCancel();
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <p role="alert" className="flex items-start gap-2 text-base">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="mt-0.5 shrink-0" />
          {error}
        </p>
        <div className="flex flex-col gap-3">
          <ImageUpload primary onImage={onCapture} />
          <Button variant="outline" size="lg" onClick={onTypeInstead}>
            Type it myself
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Camera view"
        onLoadedData={() => setHasPicture(true)}
        className="max-h-[60vh] w-full rounded-xl border border-border bg-muted"
      />
      <p>Hold the label flat in good light, then take the photo.</p>
      <div className="flex flex-col gap-3">
        {/* Off until the camera shows a picture, so the photo is never blank */}
        <Button size="lg" onClick={handleTakePhoto} disabled={!hasPicture}>
          Take the photo
        </Button>
        <Button variant="outline" size="lg" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
