'use client';

// FFScouter-parity feature flag hook.
//
// Mirrors extension/src/lib/api.ts:fetchFeatureFlags(). One module-level
// cache keyed by a 60s TTL so every page using a flag-gated component
// shares the same fetch instead of re-hitting /api/extension/feature-flags
// per component.

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

const TTL_MS = 60_000;
let _cache: { value: FeatureFlags; fetchedAt: number } | null = null;
let _inflight: Promise<FeatureFlags> | null = null;

async function loadFlags(): Promise<FeatureFlags> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL_MS) return _cache.value;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch('/api/extension/feature-flags', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = (await res.json()) as Partial<FeatureFlags>;
      const value: FeatureFlags = {
        ff_score: Boolean(parsed.ff_score),
        flights: Boolean(parsed.flights),
        activity: Boolean(parsed.activity),
        hit_calling: Boolean(parsed.hit_calling),
      };
      _cache = { value, fetchedAt: Date.now() };
      return value;
    } catch {
      // Fail closed — never accidentally show a dark-launched UI on a
      // network blip.
      _cache = { value: DEFAULT_FLAGS, fetchedAt: Date.now() };
      return DEFAULT_FLAGS;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function useFeatureFlags(): { flags: FeatureFlags; loading: boolean } {
  const [flags, setFlags] = useState<FeatureFlags>(_cache?.value ?? DEFAULT_FLAGS);
  const [loading, setLoading] = useState<boolean>(!_cache);

  useEffect(() => {
    let cancelled = false;
    void loadFlags().then((v) => {
      if (!cancelled) {
        setFlags(v);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { flags, loading };
}
