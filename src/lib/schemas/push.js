import { z } from 'zod';

const NOT_VALID = 'Reminders could not be turned on for this device. Please try again.';

// An https push service on a named host, never an IP address or localhost
const endpoint = z
  .url({ protocol: /^https$/, hostname: z.regexes.domain, error: NOT_VALID })
  .max(2048, NOT_VALID);

const key = z.string(NOT_VALID).min(1, NOT_VALID).max(512, NOT_VALID);

// FR10 The browser's PushSubscription.toJSON(); expirationTime is dropped
export const pushSubscriptionInput = z.object({
  endpoint,
  keys: z.object({ p256dh: key, auth: key }, NOT_VALID),
});

// FR10 Turn reminders off for one device
export const pushSubscriptionDeleteInput = z.object({ endpoint });
