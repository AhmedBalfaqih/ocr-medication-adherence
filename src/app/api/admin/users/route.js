import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { route } from '@/lib/http';

// Account fields only; the admin never sees medical data or the password hash (DR8)
const ACCOUNT_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
};

// FR14 Manage user accounts: list every account, newest first
export const GET = route(async (request) => {
  await requireRole(request, 'ADMIN');
  const accounts = await prisma.user.findMany({
    select: ACCOUNT_FIELDS,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return NextResponse.json(accounts);
});
