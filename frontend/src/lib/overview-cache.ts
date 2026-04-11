/**
 * Shared in-memory cache for /api/overview responses.
 *
 * useWarData, useTeamData, useEnemyData all need overview data.
 * Instead of each hook fetching independently, they share this cache.
 * The cache deduplicates concurrent requests and reuses data within TTL.
 */
import { api } from "@/lib/api-client";
import type { OverviewResponse } from "@/types/war";

const CACHE_TTL = 15_000; // 15s — overview is refreshed by scheduler every 30s

let _data: OverviewResponse | null = null;
let _fetchedAt = 0;
let _pending: Promise<OverviewResponse> | null = null;

export async function getOverview(forceRefresh = false): Promise<OverviewResponse> {
  const now = Date.now();

  // Return cached data if fresh
  if (!forceRefresh && _data && now - _fetchedAt < CACHE_TTL) {
    return _data;
  }

  // Deduplicate concurrent fetches
  if (_pending) return _pending;

  _pending = api.overview().then((result) => {
    _data = result;
    _fetchedAt = Date.now();
    _pending = null;
    return result;
  }).catch((err) => {
    _pending = null;
    throw err;
  });

  return _pending;
}

/** Get cached data without fetching (for instant renders). */
export function getCachedOverview(): OverviewResponse | null {
  return _data;
}
