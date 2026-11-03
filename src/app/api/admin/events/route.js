import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { route } from '@/lib/http';

const EVENT_LIMIT = 50;

// FR15 Monitor system: the newest events, each with the linked account email or null
export const GET = route(async (request) => {
  await requireRole(request, 'ADMIN');
  const events = await prisma.systemEvent.findMany({
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
      user: { select: { email: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: EVENT_LIMIT,
  });
  const rows = events.map((event) => ({
    id: event.id,
    type: event.type,
    message: event.message,
    createdAt: event.createdAt,
    email: event.user?.email ?? null,
  }));
  return NextResponse.json(rows);
});
