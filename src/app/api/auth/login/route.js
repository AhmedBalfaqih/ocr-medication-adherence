import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HttpError, readJson, route } from '@/lib/http';
import { loginInput } from '@/lib/schemas/auth';
import { setSession } from '@/lib/session';
import { recordEvent } from '@/services/events';

// FR2 User login with email and password
export const POST = route(async (request) => {
  const input = await readJson(request, loginInput);
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, role: true, status: true, passwordHash: true },
  });
  const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;

  // One answer for an unknown email, a wrong password and a suspended account
  if (!user || !passwordMatches || user.status !== 'ACTIVE') {
    await recordEvent('LOGIN_FAILED', 'A login failed.', user?.id ?? null);
    throw new HttpError(401, 'LOGIN_FAILED', 'Email or password is incorrect.');
  }

  const response = NextResponse.json({ id: user.id, name: user.name, role: user.role });
  await setSession(response, user);
  return response;
});
