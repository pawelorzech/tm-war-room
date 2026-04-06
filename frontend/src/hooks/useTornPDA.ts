'use client';

import { useState, useEffect } from 'react';

interface TornPDABridge {
  callHandler: (name: string, ...args: unknown[]) => Promise<unknown>;
}

interface TornPDAState {
  isPDA: boolean;
  bridge: TornPDABridge | null;
}

declare global {
  interface Window {
    flutter_inappwebview?: TornPDABridge;
  }
}

export function useTornPDA(): TornPDAState {
  const [state, setState] = useState<TornPDAState>({ isPDA: false, bridge: null });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.flutter_inappwebview) return;

    window.flutter_inappwebview.callHandler('isTornPDA')
      .then((result: unknown) => {
        const r = result as { isTornPDA?: boolean } | null;
        if (r?.isTornPDA) {
          setState({ isPDA: true, bridge: window.flutter_inappwebview! });
        }
      })
      .catch(() => {});
  }, []);

  return state;
}
