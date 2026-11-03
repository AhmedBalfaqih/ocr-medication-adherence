import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, parseId, readJson, route } from '@/lib/http';
import { medicineInput } from '@/lib/schemas/medicine';

// Only what the screens need; userId stays on the server
const MEDICINE_FIELDS = {
  id: true,
  name: true,
  dosage: true,
  notes: true,
  source: true,
  createdAt: true,
  updatedAt: true,
};

// FR4 Manage medicine records: view one
export const GET = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { id } = await params;
  const medicine = await prisma.medicine.findFirst({
    where: { id: parseId(id), userId: user.id },
    select: MEDICINE_FIELDS,
  });
  if (!medicine) throw new HttpError(404, 'NOT_FOUND', 'Medicine not found.');
  return NextResponse.json(medicine);
});

// FR4 DR7 Manage medicine records: edit one
export const PATCH = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { id } = await params;
  const medicineId = parseId(id);
  const input = await readJson(request, medicineInput);

  const data = { name: input.name, dosage: input.dosage };
  // Blank notes clear the value; notes that were not sent stay as they are
  if (input.notes !== undefined) {
    data.notes = input.notes || null;
  }

  const { count } = await prisma.medicine.updateMany({
    where: { id: medicineId, userId: user.id },
    data,
  });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Medicine not found.');

  const medicine = await prisma.medicine.findFirst({
    where: { id: medicineId, userId: user.id },
    select: MEDICINE_FIELDS,
  });
  // It could have been deleted between the two queries
  if (!medicine) throw new HttpError(404, 'NOT_FOUND', 'Medicine not found.');
  return NextResponse.json(medicine);
});

// FR4 DR7 Manage medicine records: delete one with its schedules, reminders and logs
export const DELETE = route(async (request, { params }) => {
  const user = await requireRole(request, 'PATIENT');
  const { id } = await params;
  const { count } = await prisma.medicine.deleteMany({
    where: { id: parseId(id), userId: user.id },
  });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Medicine not found.');
  return new NextResponse(null, { status: 204 });
});
