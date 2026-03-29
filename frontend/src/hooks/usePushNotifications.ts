'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';

export type PushEvent = 'loot_level4' | 'war_start' | 'stakeout_change' | 'oc_ready';

export interface PushPreferences {
  loot_level4: boolean;
  war_start: boolean;
  stakeout_change: boolean;
  oc_ready: boolean;
  [key: string]: boolean;
}

const DEFAULT_PREFERENCES: PushPreferences = {
  loot_level4: true,
  war_start: true,
  stakeout_change: true,
  oc_ready: true,
};

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PREFERENCES);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    api.pushVapidKey()
      .then(d => {
        setVapidKey(d.vapid_public_key);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub);
      });
    }).catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidKey || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') return;

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const subJson = sub.toJSON();

    await api.pushSubscribe({
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh || '',
        auth: subJson.keys?.auth || '',
      },
      preferences: DEFAULT_PREFERENCES,
    });

    setSubscribed(true);
    setPreferences(DEFAULT_PREFERENCES);
  }, [vapidKey]);

  const unsubscribe = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.pushUnsubscribe(sub.endpoint);
      await sub.unsubscribe();
    }
    setSubscribed(false);
  }, []);

  const updatePreferences = useCallback(async (newPrefs: PushPreferences) => {
    setPreferences(newPrefs);
    await api.pushPreferences(newPrefs);
  }, []);

  const sendTest = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('TM Hub Test', {
      body: 'Push notifications are working!',
      icon: '/favicon.ico',
    });
  }, []);

  return {
    permission,
    subscribed,
    preferences,
    vapidKey,
    loading,
    supported: typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator,
    subscribe,
    unsubscribe,
    updatePreferences,
    sendTest,
  };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}
