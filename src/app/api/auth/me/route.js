import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/http';
import { todayIn } from '@/lib/time';

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

// FR3 View profile details; the screens also use it to check the session
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: PUBLIC_FIELDS,
  });
  // Date fields start from the patient's today, worked out here and not on the device
  return NextResponse.json({ ...profile, today: todayIn(profile.timezone) });
});
