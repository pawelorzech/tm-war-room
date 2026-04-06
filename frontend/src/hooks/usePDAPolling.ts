'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { usePDA } from '@/contexts/PDAContext';

const POLL_INTERVAL = 15_000; // 15 seconds

export function usePDAPolling() {
  const { isPDA, bridge } = usePDA();
  const [registered, setRegistered] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-register on PDA detection
  useEffect(() => {
    if (!isPDA) return;
    api.pdaRegister()
      .then(() => setRegistered(true))
      .catch(() => {});
  }, [isPDA]);

  // Start polling when registered
  useEffect(() => {
    if (!isPDA || !registered || !bridge) return;

    const poll = async () => {
      try {
        const data = await api.pdaPoll();
        if (data.events.length > 0) {
          setMissedCount(data.events.length);
          for (const event of data.events) {
            bridge.callHandler('scheduleNotification', {
              title: event.title,
              id: event.event_id % 10000,
              timestamp: Date.now() + 1000,
              subtitle: event.body,
              urlCallback: event.url ? `https://hub.tri.ovh${event.url}` : 'https://hub.tri.ovh/notifications',
            });
          }
        }
      } catch {
        // silent — network errors are expected
      }
    };

    // Initial poll (catch-up)
    poll();

    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPDA, registered, bridge]);

  return { isPDA, registered, missedCount };
}
