import { expect, test } from 'vitest';
import { medicineInput } from '@/lib/schemas/medicine';

const NAME_MISSING = 'Please enter the medicine name.';
const DOSE_MISSING = 'Please enter the dose, for example 500 mg.';

function firstMessage(result) {
  return result.error.issues[0].message;
}

test('a medicine is trimmed and unknown fields are left out', () => {
  const result = medicineInput.safeParse({
    name: '  Paracetamol  ',
    dosage: ' 500 mg ',
    notes: '  After food  ',
    userId: 7,
    ocrScanId: 3,
    confirmed: true,
  });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({ name: 'Paracetamol', dosage: '500 mg', notes: 'After food' });
});

test('a medicine from a scanned label is refused, even with a confirm flag', () => {
  const base = { name: 'Paracetamol', dosage: '500 mg' };
  for (const extra of [{ source: 'OCR' }, { source: 'OCR', ocrScanId: 3, confirmed: true }]) {
    const result = medicineInput.safeParse({ ...base, ...extra });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe('Please confirm the scanned details before saving.');
  }

  expect(medicineInput.safeParse({ ...base, source: 'MANUAL' }).success).toBe(true);
});

test('notes are optional and may be blank', () => {
  const noNotes = medicineInput.safeParse({ name: 'Paracetamol', dosage: '500 mg' });
  expect(noNotes.success).toBe(true);
  expect('notes' in noNotes.data).toBe(false);

  const blankNotes = medicineInput.safeParse({ name: 'Paracetamol', dosage: '500 mg', notes: '' });
  expect(blankNotes.data).toEqual({ name: 'Paracetamol', dosage: '500 mg', notes: '' });
});

test('a name that is missing, blank or not text gets the plain message', () => {
  for (const name of [undefined, '', '   ', 42, null]) {
    const result = medicineInput.safeParse({ name, dosage: '500 mg' });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(NAME_MISSING);
  }
});

test('a dose that is missing, blank or not text gets the plain message', () => {
  for (const dosage of [undefined, '', '   ', 500, null]) {
    const result = medicineInput.safeParse({ name: 'Paracetamol', dosage });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(DOSE_MISSING);
  }
});

test('the name is 1 to 120 characters after trimming', () => {
  const longest = medicineInput.safeParse({ name: ` ${'a'.repeat(120)} `, dosage: '500 mg' });
  expect(longest.success).toBe(true);
  expect(longest.data.name).toBe('a'.repeat(120));

  const tooLong = medicineInput.safeParse({ name: 'a'.repeat(121), dosage: '500 mg' });
  expect(tooLong.success).toBe(false);
  expect(firstMessage(tooLong)).toBe('Please use 120 characters or fewer for the medicine name.');

  expect(medicineInput.safeParse({ name: 'a', dosage: '500 mg' }).success).toBe(true);
});

test('the dose is 1 to 60 characters after trimming', () => {
  const longest = medicineInput.safeParse({ name: 'Paracetamol', dosage: 'a'.repeat(60) });
  expect(longest.success).toBe(true);

  const tooLong = medicineInput.safeParse({ name: 'Paracetamol', dosage: 'a'.repeat(61) });
  expect(tooLong.success).toBe(false);
  expect(firstMessage(tooLong)).toBe('Please use 60 characters or fewer for the dose.');

  expect(medicineInput.safeParse({ name: 'Paracetamol', dosage: '1' }).success).toBe(true);
});

test('notes are up to 500 characters of text', () => {
  const base = { name: 'Paracetamol', dosage: '500 mg' };
  expect(medicineInput.safeParse({ ...base, notes: 'a'.repeat(500) }).success).toBe(true);

  const tooLong = medicineInput.safeParse({ ...base, notes: 'a'.repeat(501) });
  expect(tooLong.success).toBe(false);
  expect(firstMessage(tooLong)).toBe('Please use 500 characters or fewer for your notes.');

  const notText = medicineInput.safeParse({ ...base, notes: null });
  expect(notText.success).toBe(false);
  expect(firstMessage(notText)).toBe('Please enter your notes as text.');
});

test('an empty body asks for the name first', () => {
  const result = medicineInput.safeParse({});
  expect(result.success).toBe(false);
  expect(firstMessage(result)).toBe(NAME_MISSING);
});
