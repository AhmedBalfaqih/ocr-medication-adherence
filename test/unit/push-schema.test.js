import { expect, test } from 'vitest';
import { pushSubscriptionDeleteInput, pushSubscriptionInput } from '@/lib/schemas/push';

const PUSH_NOT_VALID = 'Reminders could not be turned on for this device. Please try again.';

// Shaped like PushSubscription.toJSON() in a browser, with made up values
const SUBSCRIPTION = {
  endpoint: 'https://push.example.com/send/test-device-1',
  expirationTime: null,
  keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' },
};

function firstIssue(result) {
  expect(result.success).toBe(false);
  const issue = result.error.issues[0];
  return { path: issue.path.join('.'), message: issue.message };
}

function subscriptionIssue(fields) {
  return firstIssue(pushSubscriptionInput.safeParse({ ...SUBSCRIPTION, ...fields }));
}

test('a browser subscription is accepted without its expiration time', () => {
  const result = pushSubscriptionInput.safeParse({ ...SUBSCRIPTION, userId: 7 });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({
    endpoint: SUBSCRIPTION.endpoint,
    keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' },
  });
});

test('an endpoint that is not https on a named host is refused', () => {
  const endpoints = [
    'http://push.example.com/send/test-device-1',
    'https://10.0.0.1/send/test-device-1',
    'https://127.0.0.1/send/test-device-1',
    'https://[::1]/send/test-device-1',
    'https://localhost/send/test-device-1',
    'not a web address',
  ];
  for (const endpoint of endpoints) {
    expect(subscriptionIssue({ endpoint })).toEqual({ path: 'endpoint', message: PUSH_NOT_VALID });
  }
});

test('an endpoint longer than 2048 characters is refused', () => {
  const endpoint = `https://push.example.com/${'a'.repeat(2048)}`;
  expect(subscriptionIssue({ endpoint })).toEqual({ path: 'endpoint', message: PUSH_NOT_VALID });
});

test('missing, empty or very long keys are refused', () => {
  expect(subscriptionIssue({ keys: undefined })).toEqual({
    path: 'keys',
    message: PUSH_NOT_VALID,
  });
  expect(subscriptionIssue({ keys: { p256dh: 'test-p256dh-key', auth: '' } })).toEqual({
    path: 'keys.auth',
    message: PUSH_NOT_VALID,
  });
  expect(subscriptionIssue({ keys: { p256dh: 'a'.repeat(513), auth: 'test-auth-key' } })).toEqual({
    path: 'keys.p256dh',
    message: PUSH_NOT_VALID,
  });
});

test('turning reminders off needs a valid endpoint and nothing else', () => {
  const result = pushSubscriptionDeleteInput.safeParse({ endpoint: SUBSCRIPTION.endpoint });
  expect(result.success).toBe(true);
  expect(result.data).toEqual({ endpoint: SUBSCRIPTION.endpoint });

  for (const endpoint of [null, '', 'https://localhost/send/test-device-1']) {
    expect(firstIssue(pushSubscriptionDeleteInput.safeParse({ endpoint }))).toEqual({
      path: 'endpoint',
      message: PUSH_NOT_VALID,
    });
  }
});
