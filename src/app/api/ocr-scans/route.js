import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { ocrScanInput } from '@/lib/schemas/ocr-scan';

// FR6 FR7 CIR3 Keep the text read from a label; the image never leaves the device
export const POST = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const input = await readJson(request, ocrScanInput);
  const scan = await prisma.oCRScan.create({
    data: {
      userId: user.id,
      extractedText: input.extractedText,
      imagePath: null,
      medicineId: null,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: scan.id }, { status: 201 });
});
