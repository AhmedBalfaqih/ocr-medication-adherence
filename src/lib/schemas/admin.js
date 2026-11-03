import { z } from 'zod';

const STATUS_MISSING = 'Please choose Active or Suspended.';

// FR14 The only account change the admin can make; a role in the body is dropped
export const accountStatusInput = z.object(
  { status: z.enum(['ACTIVE', 'SUSPENDED'], STATUS_MISSING) },
  STATUS_MISSING,
);
