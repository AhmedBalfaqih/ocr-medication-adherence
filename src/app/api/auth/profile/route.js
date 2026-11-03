import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { readJson, route } from '@/lib/http';
import { profileInput } from '@/lib/schemas/auth';

// Never includes passwordHash
const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  timezone: true,
  dateOfBirth: true,
  conditions: true,
};

// FR3 Manage profile: the patient changes only their own details
export const PATCH = route(async (request) => {
  const user = await requireRole(request, 'PATIENT');
  const input = await readJson(request, profileInput);

  const data = { name: input.name };
  // A blank field clears the value; a field that was not sent stays as it is
  if (input.dateOfBirth !== undefined) {
    data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  }
  if (input.conditions !== undefined) {
    data.conditions = input.conditions || null;
  }

  const profile = await prisma.user.update({
    where: { id: user.id },
    data,
    select: PUBLIC_FIELDS,
  });
  return NextResponse.json(profile);
});
