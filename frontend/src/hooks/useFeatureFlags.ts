"use client";

import { useEffect, useState } from "react";

// Public feature-flag endpoint (no auth). Mirrors the Companion's flag-fetch
// in shape: defaults to all-off so an unreachable backend never accidentally
// lights up a dark-launched feature.

export interface FeatureFlags {
  ff_score: boolean;
  flights: boolean;
  activity: boolean;
  hit_calling: boolean;
}

const DEFAULTS: FeatureFlags = {
  ff_score: false,
  flights: false,
  activity: false,
  hit_calling: false,
};

const TTL_MS = 60_000;

let _cache: { value: FeatureFlags; fetchedAt: number } | null = null;
let _inflight: Promise<FeatureFlags> | null = null;

async function fetchFlags(): Promise<FeatureFlags> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < TTL_MS) return _cache.value;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch("/api/extension/feature-flags", {
        credentials: "include",
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
      // Network/parse failure: cache the defaults briefly so we don't hammer
      // the endpoint while it's down.
      _cache = { value: DEFAULTS, fetchedAt: Date.now() };
      return DEFAULTS;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export function useFeatureFlags(): FeatureFlags {
  // Seed from the module-level cache so we don't flash defaults on remount.
  const [flags, setFlags] = useState<FeatureFlags>(() => _cache?.value ?? DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    void fetchFlags().then((v) => {
      if (!cancelled) setFlags(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return flags;
}
