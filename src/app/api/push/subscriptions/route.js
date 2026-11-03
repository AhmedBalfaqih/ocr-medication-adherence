import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, readJson, route } from '@/lib/http';
import { pushSubscriptionDeleteInput, pushSubscriptionInput } from '@/lib/schemas/push';

// FR10 NIR1 Save this device for reminders; the app sends it again on every open
export const POST = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const input = await readJson(request, pushSubscriptionInput);
  // One row per device, so a device that changes hands moves to the new account
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    update: { userId: user.id, p256dh: input.keys.p256dh, auth: input.keys.auth },
    select: { id: true },
  });
  return NextResponse.json({ id: subscription.id });
});

// FR10 Turn reminders off for this device; a DELETE has no body, so the endpoint is in the query
export const DELETE = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const result = pushSubscriptionDeleteInput.safeParse({
    endpoint: request.nextUrl.searchParams.get('endpoint'),
  });
  if (!result.success) throw new HttpError(400, 'VALIDATION', result.error.issues[0].message);

  const { count } = await prisma.pushSubscription.deleteMany({
    where: { endpoint: result.data.endpoint, userId: user.id },
  });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Reminders are not on for this device.');
  return new NextResponse(null, { status: 204 });
});
