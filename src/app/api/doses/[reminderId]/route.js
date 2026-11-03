import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, parseId, readJson, route } from '@/lib/http';
import { doseAnswerInput } from '@/lib/schemas/dose';
import { localDateTime } from '@/lib/time';
import { getTotals } from '@/services/adherence';

const DOSE_NOT_FOUND = 'Dose not found.';
const ALREADY_RECORDED = 'This dose is already recorded.';

// Only what the dose page and the dose log need
const REMINDER_FIELDS = {
  id: true,
  scheduleId: true,
  reminderTime: true,
  status: true,
  doseLog: { select: { status: true } },
  schedule: { select: { medicine: { select: { name: true, dosage: true } } } },
};

// The owner filter reaches the patient through the schedule's medicine
function findReminder(reminderId, userId) {
  return prisma.reminder.findFirst({
    where: { id: reminderId, schedule: { medicine: { userId } } },
    select: REMINDER_FIELDS,
  });
}

// FR11 One dose for the dose page, with the answer once there is one
export const GET = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { reminderId } = await params;
  const reminder = await findReminder(parseId(reminderId), user.id);
  if (!reminder) throw new HttpError(404, 'NOT_FOUND', DOSE_NOT_FOUND);

  const { date, time } = localDateTime(reminder.reminderTime, user.timezone);
  return NextResponse.json({
    reminderId: reminder.id,
    medicineName: reminder.schedule.medicine.name,
    dosage: reminder.schedule.medicine.dosage,
    date,
    time,
    status: reminder.status,
    answer: reminder.doseLog?.status ?? null,
  });
});

// FR11 NIR3 NIR4 Log dose status: one answer per dose, and the new totals come back at once
export const POST = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { reminderId } = await params;
  const id = parseId(reminderId);
  const input = await readJson(request, doseAnswerInput);
  const reminder = await findReminder(id, user.id);
  if (!reminder) throw new HttpError(404, 'NOT_FOUND', DOSE_NOT_FOUND);

  if (reminder.doseLog) {
    await replaceMissedWithTaken(reminder, input.status, user.id);
    return NextResponse.json({ status: 'TAKEN', totals: await getTotals(user.id) });
  }

  await saveAnswer(reminder, input.status, user);
  return NextResponse.json(
    { status: input.status, totals: await getTotals(user.id) },
    { status: 201 },
  );
});

// DR7 A missed dose may still be marked taken; no column says who wrote the missed log
async function replaceMissedWithTaken(reminder, status, userId) {
  if (reminder.doseLog.status !== 'MISSED' || status !== 'TAKEN') {
    throw new HttpError(409, 'ALREADY_RECORDED', ALREADY_RECORDED);
  }
  // Only while it still says missed, so two answers at once change it once
  const { count } = await prisma.doseLog.updateMany({
    where: { reminderId: reminder.id, status: 'MISSED', schedule: { medicine: { userId } } },
    data: { status: 'TAKEN', loggedAt: new Date() },
  });
  if (count === 0) throw new HttpError(409, 'ALREADY_RECORDED', ALREADY_RECORDED);
}

// FR11 The log keeps the dose's own local date and time, not the time of the answer
async function saveAnswer(reminder, status, user) {
  const { date, time } = localDateTime(reminder.reminderTime, user.timezone);
  try {
    await prisma.$transaction([
      prisma.doseLog.create({
        data: {
          scheduleId: reminder.scheduleId,
          reminderId: reminder.id,
          status,
          date: new Date(date),
          time,
        },
      }),
      prisma.reminder.updateMany({
        where: { id: reminder.id, schedule: { medicine: { userId: user.id } } },
        data: { status: 'RESOLVED' },
      }),
    ]);
  } catch (error) {
    // The unique reminderId stops a second log when two answers arrive together
    if (error.code === 'P2002') throw new HttpError(409, 'ALREADY_RECORDED', ALREADY_RECORDED);
    throw error;
  }
}
