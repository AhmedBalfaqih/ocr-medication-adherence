import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, parseId, readJson, route } from '@/lib/http';
import { scheduleUpdateInput } from '@/lib/schemas/schedule';
import { localDateTime, nextOccurrenceAfter } from '@/lib/time';

// Only what the screens need, plus the dates time.js reads
const SCHEDULE_FIELDS = {
  id: true,
  medicineId: true,
  time: true,
  frequency: true,
  daysOfWeek: true,
  startDate: true,
  endDate: true,
};

// A @db.Date comes back as UTC midnight, so its first ten characters are the date
function dateText(date) {
  return date.toISOString().slice(0, 10);
}

// The server works out the next dose in the patient's zone, so the screens never do
function scheduleView(schedule, timeZone, now) {
  const next = nextOccurrenceAfter(schedule, timeZone, now);
  return {
    id: schedule.id,
    medicineId: schedule.medicineId,
    time: schedule.time,
    frequency: schedule.frequency,
    daysOfWeek: schedule.daysOfWeek,
    startDate: dateText(schedule.startDate),
    endDate: schedule.endDate ? dateText(schedule.endDate) : null,
    next: next ? localDateTime(next, timeZone) : null,
  };
}

// FR9 Manage medication schedule: view one
export const GET = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { id } = await params;
  const schedule = await prisma.schedule.findFirst({
    where: { id: parseId(id), medicine: { userId: user.id } },
    select: SCHEDULE_FIELDS,
  });
  if (!schedule) throw new HttpError(404, 'NOT_FOUND', 'Schedule not found.');
  return NextResponse.json(scheduleView(schedule, user.timezone, new Date()));
});

// FR9 UC5 DR2 Manage medication schedule: edit one, only with the patient's own input
export const PATCH = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { id } = await params;
  const scheduleId = parseId(id);
  const input = await readJson(request, scheduleUpdateInput);

  const { count } = await prisma.schedule.updateMany({
    where: { id: scheduleId, medicine: { userId: user.id } },
    data: {
      time: input.time,
      frequency: input.frequency,
      daysOfWeek: input.daysOfWeek,
      startDate: new Date(input.startDate),
      // An empty or missing end date means the schedule has no end
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
  });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Schedule not found.');

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, medicine: { userId: user.id } },
    select: SCHEDULE_FIELDS,
  });
  // It could have been deleted between the two queries
  if (!schedule) throw new HttpError(404, 'NOT_FOUND', 'Schedule not found.');
  return NextResponse.json(scheduleView(schedule, user.timezone, new Date()));
});

// FR9 DR7 Manage medication schedule: delete one with its reminders and logs
export const DELETE = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { id } = await params;
  const { count } = await prisma.schedule.deleteMany({
    where: { id: parseId(id), medicine: { userId: user.id } },
  });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Schedule not found.');
  return new NextResponse(null, { status: 204 });
});
