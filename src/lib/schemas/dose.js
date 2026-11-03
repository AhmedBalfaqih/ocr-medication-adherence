import { z } from 'zod';

const STATUS_MISSING = 'Please choose Taken, Skipped or Missed.';

// FR11 The patient's answer for one dose
export const doseAnswerInput = z.object({
  status: z.enum(['TAKEN', 'SKIPPED', 'MISSED'], STATUS_MISSING),
});
