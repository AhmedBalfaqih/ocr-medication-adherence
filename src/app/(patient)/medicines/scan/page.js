'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { CameraCapture } from '@/features/ocr/camera-capture';
import { ImageUpload } from '@/features/ocr/image-upload';
import { parseLabel } from '@/features/ocr/parse-label';
import { recognizeLabel } from '@/features/ocr/recognize-label';
import { ScanReview } from '@/features/ocr/scan-review';
import { api } from '@/lib/api';

const EMPTY_MEDICINE = { name: '', dosage: '', notes: '' };
const NO_CHECKS = { name: false, dosage: false };
const LABEL_NOT_READ =
  "We couldn't read this label clearly. Try again with more light, or type the details.";

const HEADINGS = {
  choose: 'Scan a medicine label',
  camera: 'Take a photo of the label',
  reading: 'Reading the label',
  review: 'Check the details',
  manual: 'Type the details',
};

// FR6 FR7 FR8 UC4 Scan a label, check what was read, then save it as a medicine
export default function ScanLabelPage() {
  const router = useRouter();
  const [step, setStep] = useState('choose');
  const [image, setImage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [ocrScanId, setOcrScanId] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_MEDICINE);
  const [checkFields, setCheckFields] = useState(NO_CHECKS);
  const [formKey, setFormKey] = useState(0);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);

  function openCamera() {
    setMessage('');
    setStep('camera');
  }

  function backToStart() {
    setMessage('');
    setStep('choose');
  }

  // UC4 the form keeps whatever is in it
  function typeInstead() {
    setMessage('');
    setStep('manual');
  }

  // UC4 a failed scan never blocks adding the medicine by hand
  function showManualEntry(text) {
    setMessage(text);
    setStep('manual');
  }

  // FR7 Read the photo in the browser; only the text is sent to the server (CIR3)
  async function readLabel(picture) {
    setImage(picture);
    setMessage('');
    setProgress(0);
    setStep('reading');

    let text;
    let reading;
    try {
      const data = await recognizeLabel(picture, (part) => setProgress(Math.round(part * 100)));
      text = data.text.trim();
      reading = parseLabel(data);
    } catch (error) {
      // Missing OCR files or a worker crash land here
      if (process.env.NODE_ENV === 'development') console.error(error);
      showManualEntry(LABEL_NOT_READ);
      return;
    }
    if (!text) {
      showManualEntry(LABEL_NOT_READ);
      return;
    }

    let scan;
    try {
      scan = await api('/ocr-scans', { method: 'POST', body: { extractedText: text } });
    } catch (scanError) {
      showManualEntry(scanError.message);
      return;
    }

    setOcrScanId(scan.id);
    setFormValues({ name: reading.name, dosage: reading.dosage, notes: reading.notes });
    setCheckFields(reading.check);
    // A new reading starts the form again with the new details
    setFormKey((key) => key + 1);
    setStep('review');
  }

  // FR8 CIR5 The press on Confirm and save is the confirmation the server asks for
  async function confirmScannedMedicine(values) {
    const medicine = await api('/medicines', {
      method: 'POST',
      body: { ...values, source: 'OCR', ocrScanId, confirmed: true },
    });
    setSaved(true);
    router.replace(`/medicines/${medicine.id}`);
  }

  // FR5 No scan filled the form, so the patient typed every detail
  async function saveTypedMedicine(values) {
    const medicine = await api('/medicines', {
      method: 'POST',
      body: { ...values, source: 'MANUAL' },
    });
    setSaved(true);
    router.replace(`/medicines/${medicine.id}`);
  }

  const showForm = step === 'review' || step === 'manual';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">{HEADINGS[step]}</h1>
      {message && (
        <p role="alert" className="flex items-start gap-2 text-base">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}

      {step === 'choose' && (
        <>
          <p>
            Take a clear photo of the label. You will check the details before anything is saved.
          </p>
          <div className="flex flex-col gap-3">
            <Button size="lg" onClick={openCamera}>
              Take a photo
            </Button>
            <ImageUpload onImage={readLabel} />
            <Button variant="outline" size="lg" onClick={typeInstead}>
              Type it myself
            </Button>
          </div>
        </>
      )}

      {step === 'camera' && (
        <CameraCapture onCapture={readLabel} onCancel={backToStart} onTypeInstead={typeInstead} />
      )}

      {step === 'reading' && (
        <>
          <Progress value={progress}>
            <ProgressLabel>Reading the label…</ProgressLabel>
            <ProgressValue />
          </Progress>
          <p>This can take a little while. Please keep this page open.</p>
        </>
      )}

      {/* Hidden, not removed, while scanning again, so typed details are kept (UC4) */}
      <div hidden={!showForm}>
        {/* CIR5 details that came from a scan are only ever saved through Confirm and save */}
        <ScanReview
          key={formKey}
          image={image}
          defaultValues={formValues}
          checkFields={checkFields}
          manual={ocrScanId === null}
          saved={saved}
          onSave={ocrScanId === null ? saveTypedMedicine : confirmScannedMedicine}
          onScanAgain={backToStart}
          onTypeInstead={step === 'review' ? typeInstead : null}
        />
      </div>
    </div>
  );
}
