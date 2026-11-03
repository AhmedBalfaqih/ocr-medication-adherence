import { z } from 'zod';

const NO_TEXT = 'We could not read any text on this label.';

const extractedText = z
  .string(NO_TEXT)
  .trim()
  .min(1, NO_TEXT)
  .max(5000, 'This label has too much text. Please type the details instead.');

// FR7 Keep the text read from a label; the image never leaves the device (CIR3)
export const ocrScanInput = z.object({ extractedText });
