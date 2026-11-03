import { z } from 'zod';

const name = z
  .string('Please enter your name.')
  .trim()
  .min(1, 'Please enter your name.')
  .max(100, 'Please use 100 characters or fewer for your name.');

// Emails are stored in lower case, so login matches however it was typed
const email = z.email('Please enter a valid email address.').toLowerCase();

// bcrypt reads only the first 72 bytes of a password
const newPassword = z
  .string('Please enter a password.')
  .min(8, 'Please use at least 8 characters for your password.')
  .max(72, 'Please use 72 characters or fewer for your password.');

const password = z
  .string('Please enter your password.')
  .min(1, 'Please enter your password.')
  .max(72, 'Please use 72 characters or fewer for your password.');

// The format check reports unreadable dates, so this only rejects future ones
function isInPast(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date < new Date();
}

const pastDate = z.iso
  .date('Please enter the date as YYYY-MM-DD.')
  .refine(isInPast, 'Your date of birth must be in the past.');

// FR1 Register
export const registerInput = z.object({ name, email, password: newPassword });

// FR2 Log in
export const loginInput = z.object({ email, password });

// FR3 Update profile; an empty string means the patient left the field blank
export const profileInput = z.object({
  name,
  dateOfBirth: z.union([z.literal(''), pastDate]).optional(),
  conditions: z
    .string('Please enter your conditions as text.')
    .trim()
    .max(500, 'Please use 500 characters or fewer for your conditions.')
    .optional(),
});
