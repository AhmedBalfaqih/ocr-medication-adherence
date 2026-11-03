import { NextResponse } from 'next/server';
import { route } from '@/lib/http';
import { clearSession } from '@/lib/session';

// FR13 Logout: clears the cookie even when the session has already gone
export const POST = route(async () => {
  const response = new NextResponse(null, { status: 204 });
  clearSession(response);
  return response;
});
