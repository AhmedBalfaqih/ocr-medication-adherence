'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

// FR10 Registers /sw.js; it never asks for permission, only a button press does that
export function ServiceWorker() {
  useEffect(() => {
    async function registerAndSync() {
      if (!('serviceWorker' in navigator)) return;
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        if (!('PushManager' in window) || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        // iOS fires no pushsubscriptionchange, so the server gets the current one on each open
        await api('/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
      } catch {
        // Reminders still show in the due list when this fails
      }
    }
    registerAndSync();
  }, []);

  return null;
}
