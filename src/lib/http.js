import { NextResponse } from 'next/server';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HAS_BODY = new Set(['POST', 'PUT', 'PATCH']);
// Largest value a Postgres integer id column can hold
const MAX_ID = 2147483647;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(status, code, message) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// Same checks and one error shape for every handler
export function route(handler) {
  return async (request, context) => {
    try {
      checkOriginAndType(request);
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message);
      // Log only the error kind; the message can hold user data (DR5)
      console.error('Route failed:', error.name, error.code ?? '');
      return errorResponse(500, 'SERVER_ERROR', 'Something went wrong.');
    }
  };
}

function checkOriginAndType(request) {
  if (!UNSAFE.has(request.method)) return;
  if (request.headers.get('origin') !== process.env.APP_ORIGIN) {
    throw new HttpError(403, 'BAD_ORIGIN', 'Request origin not allowed.');
  }
  const type = request.headers.get('content-type') ?? '';
  if (HAS_BODY.has(request.method) && !type.startsWith('application/json')) {
    throw new HttpError(415, 'JSON_ONLY', 'Send JSON.');
  }
}

export async function readJson(request, schema) {
  const body = await request.json().catch(() => null);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION', result.error.issues[0]?.message ?? 'Invalid input.');
  }
  return result.data;
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id > MAX_ID) {
    throw new HttpError(404, 'NOT_FOUND', 'Not found.');
  }
  return id;
}
