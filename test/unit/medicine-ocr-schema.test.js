import { expect, test } from 'vitest';
import { medicineCreateSchema, medicineInput, scannedMedicineInput } from '@/lib/schemas/medicine';
import { ocrScanInput } from '@/lib/schemas/ocr-scan';

const NOT_CONFIRMED = 'Please confirm the scanned details before saving.';
const NO_TEXT = 'We could not read any text on this label.';
const SCANNED = {
  name: 'Testamol',
  dosage: '500 mg',
  source: 'OCR',
  ocrScanId: 3,
  confirmed: true,
};

function firstMessage(result) {
  return result.error.issues[0].message;
}

test('a confirmed scanned medicine is trimmed and unknown fields are left out', () => {
  const result = scannedMedicineInput.safeParse({
    ...SCANNED,
    name: '  Testamol  ',
    dosage: ' 500 mg ',
    notes: '  After food  ',
    userId: 7,
    imagePath: '/uploads/label.png',
  });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({
    name: 'Testamol',
    dosage: '500 mg',
    notes: 'After food',
    source: 'OCR',
    ocrScanId: 3,
    confirmed: true,
  });
});

test('a scanned medicine without confirmed true is refused', () => {
  for (const confirmed of [undefined, false, 'true', 1, null]) {
    const result = scannedMedicineInput.safeParse({ ...SCANNED, confirmed });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(NOT_CONFIRMED);
  }
});

test('a scanned medicine needs a whole positive scan id', () => {
  for (const ocrScanId of [undefined, null, '3', 0, -1, 1.5, 2147483648]) {
    const result = scannedMedicineInput.safeParse({ ...SCANNED, ocrScanId });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(NOT_CONFIRMED);
  }

  expect(scannedMedicineInput.safeParse({ ...SCANNED, ocrScanId: 2147483647 }).success).toBe(true);
});

test('a scanned medicine must say OCR exactly', () => {
  for (const source of [undefined, 'ocr', 'MANUAL']) {
    const result = scannedMedicineInput.safeParse({ ...SCANNED, source });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(NOT_CONFIRMED);
  }
});

test('a scanned medicine keeps the same name and dose rules', () => {
  const noName = scannedMedicineInput.safeParse({ ...SCANNED, name: '   ' });
  expect(noName.success).toBe(false);
  expect(firstMessage(noName)).toBe('Please enter the medicine name.');

  const longDose = scannedMedicineInput.safeParse({ ...SCANNED, dosage: 'a'.repeat(61) });
  expect(longDose.success).toBe(false);
  expect(firstMessage(longDose)).toBe('Please use 60 characters or fewer for the dose.');
});

test('only a body with source OCR gets the scanned checks', () => {
  expect(medicineCreateSchema({ source: 'OCR' })).toBe(scannedMedicineInput);
  for (const body of [{}, { source: 'MANUAL' }, { source: 'ocr' }, null, undefined, 'OCR']) {
    expect(medicineCreateSchema(body)).toBe(medicineInput);
  }
});

test('label text is trimmed and an image or other field is left out', () => {
  const result = ocrScanInput.safeParse({
    extractedText: '  TESTAMOL 500 mg\nTake one tablet  ',
    image: 'data:image/png;base64,AAAA',
    imagePath: '/uploads/label.png',
    userId: 7,
    medicineId: 4,
  });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({ extractedText: 'TESTAMOL 500 mg\nTake one tablet' });
});

test('label text that is missing, blank or not text gets the plain message', () => {
  for (const extractedText of [undefined, '', '   \n  ', 42, null]) {
    const result = ocrScanInput.safeParse({ extractedText });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(NO_TEXT);
  }
});

test('label text is 1 to 5000 characters after trimming', () => {
  const longest = ocrScanInput.safeParse({ extractedText: ` ${'a'.repeat(5000)} ` });
  expect(longest.success).toBe(true);
  expect(longest.data.extractedText).toBe('a'.repeat(5000));

  const tooLong = ocrScanInput.safeParse({ extractedText: 'a'.repeat(5001) });
  expect(tooLong.success).toBe(false);
  expect(firstMessage(tooLong)).toBe(
    'This label has too much text. Please type the details instead.',
  );

  expect(ocrScanInput.safeParse({ extractedText: 'a' }).success).toBe(true);
});
