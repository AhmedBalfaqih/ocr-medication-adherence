import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/http';
import { runTick } from '@/services/scheduler';

// timingSafeEqual throws on different lengths, so the lengths are compared first
function hasCronSecret(request) {
  const given = Buffer.from(request.headers.get('x-cron-secret') ?? '');
  const expected = Buffer.from(process.env.CRON_SECRET ?? '');
  return (
    expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected)
  );
}

// FR10 UC6 Called every minute by cron-job.org, which sends no Origin, so the secret is the check
export async function POST(request) {
  if (!hasCronSecret(request)) return errorResponse(401, 'UNAUTHORIZED', 'Wrong cron secret.');
  const result = await runTick(new Date());
  return NextResponse.json(result);
}
