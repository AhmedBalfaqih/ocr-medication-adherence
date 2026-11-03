import { prisma } from '@/lib/prisma';
import { HttpError } from '@/lib/http';
import { readSession } from '@/lib/session';

// Never includes passwordHash
const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  timezone: true,
};

// Loads the user on every request, so a suspension works at once (FR14)
export async function requireUser(request) {
  const token = request.cookies.get('session')?.value;
  if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Please log in.');
  const session = await readSession(token).catch(() => null);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Please log in.');
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: PUBLIC_FIELDS,
  });
  if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'UNAUTHORIZED', 'Please log in.');
  return user;
}

// NFR6 The role comes from the database row, not the token
export async function requireRole(request, role) {
  const user = await requireUser(request);
  if (user.role !== role) throw new HttpError(403, 'FORBIDDEN', 'You cannot do that.');
  return user;
}
