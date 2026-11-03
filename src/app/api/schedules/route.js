import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, parseId, readJson, route } from '@/lib/http';
import { scheduleCreateInput } from '@/lib/schemas/schedule';
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

// FR9 Manage medication schedule: list the schedules of one of the patient's medicines
export const GET = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const medicineId = parseId(request.nextUrl.searchParams.get('medicineId'));
  const medicine = await prisma.medicine.findFirst({
    where: { id: medicineId, userId: user.id },
    select: {
      // Earliest time first; the id settles two rows with the same time
      schedules: { orderBy: [{ time: 'asc' }, { id: 'asc' }], select: SCHEDULE_FIELDS },
    },
  });
  if (!medicine) throw new HttpError(404, 'NOT_FOUND', 'Medicine not found.');

  const now = new Date();
  const schedules = medicine.schedules.map((schedule) =>
    scheduleView(schedule, user.timezone, now),
  );
  return NextResponse.json(schedules);
});

// FR9 UC5 Manage medication schedule: add one row per time, all saved or none
export const POST = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const input = await readJson(request, scheduleCreateInput);

  const created = await prisma.$transaction(async (tx) => {
    const medicine = await tx.medicine.findFirst({
      where: { id: input.medicineId, userId: user.id },
      select: { id: true },
    });
    if (!medicine) throw new HttpError(404, 'NOT_FOUND', 'Medicine not found.');

    const schedules = [];
    // Earliest time first, so the new ids follow the order of the list
    for (const time of input.times.toSorted()) {
      const schedule = await tx.schedule.create({
        data: {
          medicineId: medicine.id,
          time,
          frequency: input.frequency,
          daysOfWeek: input.daysOfWeek,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
        },
        select: SCHEDULE_FIELDS,
      });
      schedules.push(schedule);
    }
    return schedules;
  });

  const now = new Date();
  const schedules = created.map((schedule) => scheduleView(schedule, user.timezone, now));
  return NextResponse.json(schedules, { status: 201 });
});
