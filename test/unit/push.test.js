import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { sendPush } from '@/lib/push';
import { createPatient } from '../helpers';

// The push service is faked, so nothing leaves the test
const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));
vi.mock('web-push', () => ({ default: { sendNotification, setVapidDetails } }));

const PAYLOAD = {
  reminderId: 7,
  title: 'Testamol',
  body: '500 mg due at 08:00',
  url: '/doses/7',
};

beforeAll(() => {
  // Made up keys, so no real key can reach the test output
  vi.stubEnv('VAPID_SUBJECT', 'mailto:reminders@example.com');
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key');
});

beforeEach(() => {
  sendNotification.mockReset();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

// Shaped like the WebPushError that web-push throws when the push service says no
function pushServiceError(statusCode) {
  return Object.assign(new Error('Received unexpected response code'), { statusCode });
}

function savedDevice(userId) {
  return prisma.pushSubscription.create({
    data: {
      userId,
      endpoint: `https://push.example.com/send/${randomUUID()}`,
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
    },
  });
}

function deviceCount(device) {
  return prisma.pushSubscription.count({ where: { id: device.id } });
}

test('a push the service accepts returns ok and carries the reminder as JSON', async () => {
  const { user } = await createPatient();
  const device = await savedDevice(user.id);
  sendNotification.mockResolvedValue({ statusCode: 201 });

  expect(await sendPush(device, PAYLOAD)).toEqual({ ok: true });
  expect(sendNotification).toHaveBeenCalledTimes(1);
  expect(sendNotification).toHaveBeenCalledWith(
    { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
    JSON.stringify(PAYLOAD),
    { TTL: 3600, urgency: 'high', timeout: 5000 },
  );
  expect(await deviceCount(device)).toBe(1);
});

test('a 410 from the push service deletes that device and keeps the others', async () => {
  const { user } = await createPatient();
  const goneDevice = await savedDevice(user.id);
  const otherDevice = await savedDevice(user.id);
  sendNotification.mockRejectedValue(pushServiceError(410));

  expect(await sendPush(goneDevice, PAYLOAD)).toEqual({ ok: false, gone: true });
  expect(await deviceCount(goneDevice)).toBe(0);
  expect(await deviceCount(otherDevice)).toBe(1);
});

test('a 404 from the push service deletes that device too', async () => {
  const { user } = await createPatient();
  const device = await savedDevice(user.id);
  sendNotification.mockRejectedValue(pushServiceError(404));

  expect(await sendPush(device, PAYLOAD)).toEqual({ ok: false, gone: true });
  expect(await deviceCount(device)).toBe(0);
});

test('any other failure keeps the device and only reports it', async () => {
  const { user } = await createPatient();
  const device = await savedDevice(user.id);

  for (const error of [pushServiceError(500), pushServiceError(429), new Error('Socket hang up')]) {
    sendNotification.mockRejectedValueOnce(error);
    expect(await sendPush(device, PAYLOAD)).toEqual({ ok: false });
  }
  expect(await deviceCount(device)).toBe(1);
});

test('the keys are set once, not on every push', async () => {
  // A fresh copy of the file, since an earlier test already set the keys
  vi.resetModules();
  const fresh = await import('@/lib/push');
  const { user } = await createPatient();
  const device = await savedDevice(user.id);
  sendNotification.mockResolvedValue({ statusCode: 201 });

  await fresh.sendPush(device, PAYLOAD);
  await fresh.sendPush(device, PAYLOAD);
  expect(setVapidDetails).toHaveBeenCalledTimes(1);
  expect(setVapidDetails).toHaveBeenCalledWith(
    'mailto:reminders@example.com',
    'test-public-key',
    'test-private-key',
  );
});
