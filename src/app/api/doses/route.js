import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { route } from '@/lib/http';
import { localDateTime } from '@/lib/time';

// FR10 FR11 Due list: the patient's unanswered doses that are due now, newest first
export const GET = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const now = new Date();
  const reminders = await prisma.reminder.findMany({
    where: {
      schedule: { medicine: { userId: user.id } },
      status: { in: ['PENDING', 'SENT'] },
      reminderTime: { lte: now },
      // A snoozed dose comes back once its 10 minutes are up
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    },
    orderBy: [{ reminderTime: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      reminderTime: true,
      schedule: { select: { medicine: { select: { name: true, dosage: true } } } },
    },
  });

  const doses = reminders.map((reminder) => {
    // The date and time the patient sees are in their own zone
    const { date, time } = localDateTime(reminder.reminderTime, user.timezone);
    return {
      reminderId: reminder.id,
      medicineName: reminder.schedule.medicine.name,
      dosage: reminder.schedule.medicine.dosage,
      date,
      time,
    };
  });
  return NextResponse.json(doses);
});
