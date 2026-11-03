import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, parseId, route } from '@/lib/http';

const SNOOZE_MINUTES = 10;

// FR10 DR2 Reminder.snooze(): remind again in 10 minutes; the dose time never changes
export const POST = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { reminderId } = await params;
  const id = parseId(reminderId);
  const snoozedUntil = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);

  // Only a dose with no answer yet; the tick sends it again once snoozedUntil has passed
  const { count } = await prisma.reminder.updateMany({
    where: {
      id,
      schedule: { medicine: { userId: user.id } },
      status: { in: ['PENDING', 'SENT'] },
    },
    data: { status: 'PENDING', snoozedUntil },
  });
  if (count === 1) return NextResponse.json({ snoozedUntil });

  // Nothing changed, so tell a dose that is not theirs apart from one already answered
  const reminder = await prisma.reminder.findFirst({
    where: { id, schedule: { medicine: { userId: user.id } } },
    select: { id: true },
  });
  if (!reminder) throw new HttpError(404, 'NOT_FOUND', 'Dose not found.');
  throw new HttpError(409, 'ALREADY_RECORDED', 'This dose is already recorded.');
});
