import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HttpError, readJson, route } from '@/lib/http';
import { registerInput } from '@/lib/schemas/auth';
import { setSession } from '@/lib/session';

// FR1 User registration: always a patient, never a role from the body
export const POST = route(async (request) => {
  const input = await readJson(request, registerInput);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await createPatientAccount(input, passwordHash);
  const response = NextResponse.json(user, { status: 201 });
  await setSession(response, user);
  return response;
});

// UC1 The email column is unique, so a taken email fails here even when two requests race
async function createPatientAccount(input, passwordHash) {
  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: 'PATIENT' },
      select: { id: true, name: true, role: true },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'EMAIL_TAKEN', 'That email is already registered.');
    }
    throw error;
  }
}
