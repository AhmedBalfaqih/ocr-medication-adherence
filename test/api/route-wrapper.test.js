import { NextRequest, NextResponse } from 'next/server';
import { expect, test, vi } from 'vitest';
import { HttpError, route } from '@/lib/http';
import { makeRequest } from '../helpers';

const okHandler = route(async () => NextResponse.json({ ok: true }));

const notFoundHandler = route(async () => {
  throw new HttpError(404, 'NOT_FOUND', 'Medicine not found.');
});

const brokenHandler = route(async () => {
  throw new Error('Connection lost');
});

test('a JSON POST from the app origin reaches the handler', async () => {
  const response = await okHandler(makeRequest('/api/check', { method: 'POST', body: {} }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test('a POST from another origin gets 403', async () => {
  const request = makeRequest('/api/check', {
    method: 'POST',
    body: {},
    origin: 'https://other-site.example',
  });
  const response = await okHandler(request);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { code: 'BAD_ORIGIN', message: 'Request origin not allowed.' },
  });
});

test('a POST that is not JSON gets 415', async () => {
  const request = new NextRequest(new URL('/api/check', process.env.APP_ORIGIN), {
    method: 'POST',
    headers: { origin: process.env.APP_ORIGIN, 'content-type': 'text/plain' },
    body: 'hello',
  });
  const response = await okHandler(request);
  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ error: { code: 'JSON_ONLY', message: 'Send JSON.' } });
});

test('an HttpError becomes the error shape with its status', async () => {
  const response = await notFoundHandler(makeRequest('/api/check'));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: 'NOT_FOUND', message: 'Medicine not found.' },
  });
});

test('any other error becomes a plain 500', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await brokenHandler(makeRequest('/api/check'));
  consoleError.mockRestore();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: { code: 'SERVER_ERROR', message: 'Something went wrong.' },
  });
});

test('a server error logs only its kind, never its message', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  await brokenHandler(makeRequest('/api/check'));
  expect(consoleError).toHaveBeenCalledWith('Route failed:', 'Error', '');
  consoleError.mockRestore();
});
