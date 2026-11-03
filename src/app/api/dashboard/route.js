import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { route } from '@/lib/http';
import { getHistory, getTotals } from '@/services/adherence';

// FR12 DIR5 UC7 View adherence dashboard: totals, rate, recent history and the medicine count
export const GET = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const [totals, history, medicineCount] = await Promise.all([
    getTotals(user.id),
    getHistory(user.id),
    prisma.medicine.count({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({ totals, history, medicineCount });
});
