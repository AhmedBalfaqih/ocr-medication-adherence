import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { HttpError, parseId, readJson, route } from '@/lib/http';
import { accountStatusInput } from '@/lib/schemas/admin';
import { recordEvent } from '@/services/events';

// Account fields only; the admin never sees medical data or the password hash (DR8)
const ACCOUNT_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
};

// Only patients can be changed, so the admin can never suspend or remove an admin
async function findPatientAccount(id) {
  const account = await prisma.user.findUnique({ where: { id }, select: ACCOUNT_FIELDS });
  if (!account) throw new HttpError(404, 'NOT_FOUND', 'We could not find this account.');
  if (account.role !== 'PATIENT') {
    throw new HttpError(403, 'FORBIDDEN', 'Only patient accounts can be changed.');
  }
  return account;
}

// FR14 Manage user accounts: suspend or activate a patient
export const PATCH = route(async (request, { params }) => {
  await requireRole(request, 'ADMIN');
  const { id } = await params;
  const accountId = parseId(id);
  const input = await readJson(request, accountStatusInput);
  const account = await findPatientAccount(accountId);

  const { count } = await prisma.user.updateMany({
    where: { id: accountId, role: 'PATIENT' },
    data: { status: input.status },
  });
  // It could have been removed between the two queries
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'We could not find this account.');

  if (input.status === 'SUSPENDED') {
    await recordEvent('ACCOUNT_SUSPENDED', 'An account was suspended.', accountId);
  } else {
    await recordEvent('ACCOUNT_ACTIVATED', 'An account was activated.', accountId);
  }
  return NextResponse.json({ ...account, status: input.status });
});

// FR14 Manage user accounts: remove a patient; their medical data goes with them
export const DELETE = route(async (request, { params }) => {
  await requireRole(request, 'ADMIN');
  const { id } = await params;
  const accountId = parseId(id);
  await findPatientAccount(accountId);

  const { count } = await prisma.user.deleteMany({ where: { id: accountId, role: 'PATIENT' } });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'We could not find this account.');

  // The id only, never the email, since the account is gone
  await recordEvent('ACCOUNT_REMOVED', `Account ${accountId} was removed.`);
  return new NextResponse(null, { status: 204 });
});
