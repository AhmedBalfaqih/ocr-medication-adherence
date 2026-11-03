import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, readJson, route } from '@/lib/http';
import { medicineCreateSchema } from '@/lib/schemas/medicine';

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

const SCAN_NOT_USABLE = 'This scan cannot be used. Please scan the label again.';

// FR4 Manage medicine records: list the patient's own medicines
export const GET = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const medicines = await prisma.medicine.findMany({
    where: { userId: user.id },
    // Newest first; the id settles two medicines saved in the same moment
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: MEDICINE_FIELDS,
  });
  return NextResponse.json(medicines);
});

// FR5 FR8 CIR5 DR3 Add a medicine by hand, or from a scan the patient confirmed
export const POST = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  // A copy of the body picks the checks; readJson then reads and checks the real one
  const copy = request.clone();
  const body = await copy.json().catch(() => null);
  const input = await readJson(request, medicineCreateSchema(body));
  if (input.source === 'OCR') return addScannedMedicine(user, input);

  const medicine = await prisma.medicine.create({
    data: {
      userId: user.id,
      name: input.name,
      dosage: input.dosage,
      notes: input.notes || null,
      source: 'MANUAL',
    },
    select: MEDICINE_FIELDS,
  });
  return NextResponse.json(medicine, { status: 201 });
});

// FR8 CIR5 DR3 Save the medicine and use up its scan together, or do neither
async function addScannedMedicine(user, input) {
  // Only the patient's own scan that was never confirmed; deleting its medicine clears only the link
  const unusedScan = {
    id: input.ocrScanId,
    userId: user.id,
    medicineId: null,
    confirmedText: null,
  };

  const medicine = await prisma.$transaction(async (tx) => {
    const scan = await tx.oCRScan.findFirst({ where: unusedScan, select: { id: true } });
    if (!scan) throw new HttpError(400, 'VALIDATION', SCAN_NOT_USABLE);

    const created = await tx.medicine.create({
      data: {
        userId: user.id,
        name: input.name,
        dosage: input.dosage,
        notes: input.notes || null,
        source: 'OCR',
      },
      select: MEDICINE_FIELDS,
    });

    // The same filter again, so two confirms can never use one scan
    const { count } = await tx.oCRScan.updateMany({
      where: unusedScan,
      data: { medicineId: created.id, confirmedText: confirmedText(input) },
    });
    if (count === 0) throw new HttpError(400, 'VALIDATION', SCAN_NOT_USABLE);
    return created;
  });
  return NextResponse.json(medicine, { status: 201 });
}

// The details the patient confirmed, kept beside the text the scan read
function confirmedText(input) {
  const lines = [`Name: ${input.name}`, `Dose: ${input.dosage}`];
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  return lines.join('\n');
}
