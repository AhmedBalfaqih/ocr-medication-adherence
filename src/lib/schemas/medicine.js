import { z } from 'zod';

const NOT_CONFIRMED = 'Please confirm the scanned details before saving.';

const name = z
  .string('Please enter the medicine name.')
  .trim()
  .min(1, 'Please enter the medicine name.')
  .max(120, 'Please use 120 characters or fewer for the medicine name.');

const dosage = z
  .string('Please enter the dose, for example 500 mg.')
  .trim()
  .min(1, 'Please enter the dose, for example 500 mg.')
  .max(60, 'Please use 60 characters or fewer for the dose.');

// An empty string means the patient left the notes blank
const notes = z
  .string('Please enter your notes as text.')
  .trim()
  .max(500, 'Please use 500 characters or fewer for your notes.')
  .optional();

// CIR5 an OCR medicine is refused here, so it can never skip the confirm step
const source = z.literal('MANUAL', NOT_CONFIRMED).optional();

// A positive Postgres integer id, so a huge number never reaches the database
const ocrScanId = z.int32(NOT_CONFIRMED).positive(NOT_CONFIRMED);

// FR4 FR5 Add or edit a medicine by hand
export const medicineInput = z.object({ name, dosage, notes, source });

// FR8 CIR5 Save a scanned medicine only after the patient pressed Confirm and save
export const scannedMedicineInput = z.object({
  name,
  dosage,
  notes,
  source: z.literal('OCR', NOT_CONFIRMED),
  ocrScanId,
  confirmed: z.literal(true, NOT_CONFIRMED),
});

// CIR5 a body that says OCR gets the scanned checks; anything else is checked as manual
export function medicineCreateSchema(body) {
  if (body?.source === 'OCR') return scannedMedicineInput;
  return medicineInput;
}
