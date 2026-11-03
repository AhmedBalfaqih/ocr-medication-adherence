import { afterEach, expect, test, vi } from 'vitest';
import { api, isLoggedOut } from '@/lib/api';

// The screens' session check sends the user to /login only when this says logged out
afterEach(() => {
  vi.unstubAllGlobals();
});

function answerWith(status, body) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

test('FR13 a 401 from the session check means logged out', async () => {
  answerWith(401, { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } });
  const error = await api('/auth/me').catch((thrown) => thrown);
  expect(error.status).toBe(401);
  expect(isLoggedOut(error)).toBe(true);
});

test('a server error from the session check is not a logout', async () => {
  answerWith(500, { error: { code: 'SERVER_ERROR', message: 'Something went wrong.' } });
  const error = await api('/auth/me').catch((thrown) => thrown);
  expect(error).toMatchObject({
    status: 500,
    code: 'SERVER_ERROR',
    message: 'Something went wrong.',
  });
  expect(isLoggedOut(error)).toBe(false);
});

test('a network failure during the session check is not a logout', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
  const error = await api('/auth/me').catch((thrown) => thrown);
  expect(isLoggedOut(error)).toBe(false);
});
