import { afterAll, expect, test, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/prisma';
import { makeRequest } from '../helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

test('health check says the database is connected', async () => {
  const response = await GET(makeRequest('/api/health'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, db: true });
});

test('health check returns 503 when the database does not answer', async () => {
  const query = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('No connection'));
  const response = await GET(makeRequest('/api/health'));
  query.mockRestore();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, db: false });
});
