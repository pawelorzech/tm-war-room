'use client';

// FFScouter-parity feature flags, frontend mirror of the Companion's helper
// in extension/src/lib/api.ts.
//
// One-shot fetch on mount, then re-poll every 60s. The endpoint
// (`/api/extension/feature-flags`) is in PUBLIC_API_PATHS — no auth header
// needed, no X-Player-Id needed, safe to call before the user logs in.
//
// All-false defaults mean a page can render and bail on the feature in the
// same paint — no hydration mismatch.

import { useEffect, useState } from 'react';

export interface FeatureFlags {
  ff_score: boolean;
  flights: boolean;
  activity: boolean;
  hit_calling: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  ff_score: false,
  flights: false,
  activity: false,
  hit_calling: false,
};

const REFRESH_INTERVAL_MS = 60_000;

let _cached: { value: FeatureFlags; fetchedAt: number } | null = null;
let _inflight: Promise<FeatureFlags> | null = null;

async function loadFlags(): Promise<FeatureFlags> {
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch('/api/extension/feature-flags', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as Partial<FeatureFlags>;
      const value: FeatureFlags = {
        ff_score: Boolean(body.ff_score),
        flights: Boolean(body.flights),
        activity: Boolean(body.activity),
        hit_calling: Boolean(body.hit_calling),
      };
      _cached = { value, fetchedAt: Date.now() };
      return value;
    } catch {
      _cached = { value: DEFAULT_FLAGS, fetchedAt: Date.now() };
      return DEFAULT_FLAGS;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(
    _cached?.value ?? DEFAULT_FLAGS,
  );

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    if (!_cached || now - _cached.fetchedAt >= REFRESH_INTERVAL_MS) {
      void loadFlags().then((v) => {
        if (!cancelled) setFlags(v);
      });
    } else {
      setFlags(_cached.value);
    }
    const id = window.setInterval(() => {
      void loadFlags().then((v) => {
        if (!cancelled) setFlags(v);
      });
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return flags;
}
