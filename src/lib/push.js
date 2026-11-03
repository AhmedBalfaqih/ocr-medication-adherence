import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

// The push service answers 404 or 410 once the browser has dropped the subscription
const GONE_STATUSES = new Set([404, 410]);

const PUSH_OPTIONS = {
  // A reminder an hour late is no help; the due list still shows the dose
  TTL: 60 * 60,
  // Asks the phone to show the reminder now, not when it next wakes up
  urgency: 'high',
  // One slow push service must not use up the tick's time
  timeout: 5000,
};

let vapidReady = false;

// Set on the first push only, so tests and builds without keys still load this file
function setUpVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  vapidReady = true;
}

// FR10 NIR2 Send one reminder to one saved PushSubscription row; never throws
export async function sendPush(subscription, payload) {
  const target = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  try {
    setUpVapid();
    await webpush.sendNotification(target, JSON.stringify(payload), PUSH_OPTIONS);
    return { ok: true };
  } catch (error) {
    if (!GONE_STATUSES.has(error.statusCode)) return { ok: false };
    // A failed delete is tried again on the next push to this endpoint
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint: subscription.endpoint } })
      .catch(() => null);
    return { ok: false, gone: true };
  }
}
