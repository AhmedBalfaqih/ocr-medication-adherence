'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  Notification01Icon,
  NotificationBlock01Icon,
  NotificationOff01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const TURN_ON_FAILED = 'Reminders could not be turned on for this device. Please try again.';
const TURN_OFF_FAILED = 'Reminders could not be turned off for this device. Please try again.';

// Each state shows as an icon and words, never by color alone
const STATUS = {
  'home-screen': { icon: NotificationOff01Icon, text: 'Reminders are off for this device.' },
  unsupported: { icon: Alert02Icon, text: 'Reminders are not supported in this browser.' },
  blocked: { icon: NotificationBlock01Icon, text: 'Reminders are blocked in this browser.' },
  off: { icon: NotificationOff01Icon, text: 'Reminders are off for this device.' },
  on: { icon: Notification01Icon, text: 'Reminders are on for this device.' },
};

// iOS gives push only to the Home Screen app; an iPad can name itself a Mac
function isIosOutsideHomeScreen() {
  const userAgent = navigator.userAgent;
  const isIos =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const isHomeScreenApp =
    navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !isHomeScreenApp;
}

async function readState() {
  if (isIosOutsideHomeScreen()) return 'home-screen';
  const canPush =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!canPush) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'off';
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

// subscribe() wants the public key as bytes, and it is stored as base64url text
function keyToBytes(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
}

// A 404 means the server had already dropped this device, which is what turning off wants
async function forgetSubscription(endpoint) {
  try {
    await api(`/push/subscriptions?endpoint=${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

// FR10 Reminders on this device; only a button press asks for permission
export function ReminderSettings() {
  const [state, setState] = useState('loading');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setState(await readState());
      } catch {
        setState('unsupported');
      }
    }
    load();
  }, []);

  async function handleTurnOn() {
    setWorking(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      // ready never settles if the worker failed to load, while register fails and shows the error
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      await api('/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
      setState('on');
    } catch {
      setError(TURN_ON_FAILED);
    } finally {
      setWorking(false);
    }
  }

  // The server forgets the device first, so no reminder reaches it after this
  async function handleTurnOff() {
    setWorking(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await forgetSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch {
      setError(TURN_OFF_FAILED);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section aria-labelledby="reminders-heading" className="flex flex-col gap-4">
      <h2 id="reminders-heading" className="font-heading text-xl font-medium">
        Reminders
      </h2>

      {state === 'loading' && <p>Loading…</p>}

      {state !== 'loading' && (
        <p role="status" className="flex items-center gap-2">
          <HugeiconsIcon icon={STATUS[state].icon} aria-hidden="true" className="shrink-0" />
          {STATUS[state].text}
        </p>
      )}

      {state === 'home-screen' && (
        <>
          <p>On an iPhone or iPad, reminders work only from the app on your Home Screen.</p>
          <ol className="flex list-decimal flex-col gap-2 pl-6">
            <li>Tap the Share button in your browser.</li>
            <li>Tap &quot;Add to Home Screen&quot;, then tap &quot;Add&quot;.</li>
            <li>Open the app from your Home Screen and log in.</li>
            <li>Come back to Profile and turn on reminders.</li>
          </ol>
        </>
      )}

      {state === 'unsupported' && (
        <p>You can still log each dose under Due now on the dashboard.</p>
      )}

      {state === 'blocked' && (
        <p>
          To allow them, turn on notifications for this site in your browser settings, then open
          this page again.
        </p>
      )}

      {state === 'off' && (
        <>
          <p>Turn them on to get a message on this device when a dose is due.</p>
          <Button
            variant="outline"
            size="lg"
            className="sm:self-start"
            onClick={handleTurnOn}
            disabled={working}
          >
            <HugeiconsIcon icon={Notification01Icon} aria-hidden="true" data-icon="inline-start" />
            Turn on reminders
          </Button>
        </>
      )}

      {state === 'on' && (
        <>
          <p>You get a message on this device when a dose is due.</p>
          <Button
            variant="outline"
            size="lg"
            className="sm:self-start"
            onClick={handleTurnOff}
            disabled={working}
          >
            <HugeiconsIcon
              icon={NotificationOff01Icon}
              aria-hidden="true"
              data-icon="inline-start"
            />
            Turn off reminders
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
