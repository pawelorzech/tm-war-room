"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { EntityCard, EntityRef } from "@/types/chat";

/** Module-level cache + in-flight tracker shared across all message bubbles
 *  so the resolver dedupes requests across the whole chat view. The cache
 *  TTL matches the backend's per-kind TTL — we still refetch on backend
 *  cache miss, but most of the time we'll hit. */
const cache = new Map<string, { ts: number; card: EntityCard | null }>();
const inflight = new Map<string, Promise<void>>();
const subscribers = new Map<string, Set<() => void>>();

const TTL_MS: Record<EntityRef["kind"], number> = {
  player: 60_000,
  faction: 60_000,
  item: 300_000,
  rankedwar: 15_000,
};

function isFresh(key: string, kind: EntityRef["kind"]): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.ts < TTL_MS[kind];
}

function notify(key: string): void {
  const subs = subscribers.get(key);
  if (subs) for (const fn of subs) fn();
}

async function fetchEntities(refs: EntityRef[]): Promise<void> {
  const payload = refs
    .filter(r => typeof r.id === "number" && r.id > 0)
    .map(r => ({ kind: r.kind, id: r.id as number }));
  if (payload.length === 0) return;
  try {
    const { entities } = await api.chatResolveEntities(payload);
    const now = Date.now();
    for (const ref of payload) {
      const key = `${ref.kind}:${ref.id}`;
      cache.set(key, { ts: now, card: entities[key] ?? null });
      notify(key);
    }
  } catch {
    // On failure, mark unresolved entries as null with a short TTL so we
    // retry on next visibility tick. Don't poison the cache permanently.
    const now = Date.now() - TTL_MS.rankedwar + 5000;
    for (const ref of payload) {
      const key = `${ref.kind}:${ref.id}`;
      if (!cache.has(key)) cache.set(key, { ts: now, card: null });
      notify(key);
    }
  }
}

/** Resolve a list of entity refs.
 *
 *  Returns a map keyed by ``"{kind}:{id}"``. Unresolved entries are omitted
 *  from the map (the caller falls back to rendering the original link).
 *
 *  When ``visible`` is false, the hook does not initiate any fetches — it
 *  serves whatever is in cache. This keeps offscreen messages quiet and
 *  honours the 100 calls/min budget. */
export function useEntityResolver(
  refs: EntityRef[] | undefined,
  visible: boolean,
): Record<string, EntityCard> {
  const [, setVersion] = useState(0);
  const subscribedRef = useRef<Set<string>>(new Set());

  const keys = (refs ?? [])
    .filter(r => typeof r.id === "number" && r.id > 0)
    .map(r => `${r.kind}:${r.id}`);
  const keySig = keys.join(",");

  useEffect(() => {
    if (!refs || refs.length === 0) return;

    // Subscribe / unsubscribe from update broadcasts for these keys so we
    // re-render when another bubble's fetch resolves shared entities.
    const subscribed = subscribedRef.current;
    const trigger = () => setVersion(v => v + 1);
    for (const key of keys) {
      if (!subscribed.has(key)) {
        let subs = subscribers.get(key);
        if (!subs) {
          subs = new Set();
          subscribers.set(key, subs);
        }
        subs.add(trigger);
        subscribed.add(key);
      }
    }

    return () => {
      for (const key of subscribed) {
        const subs = subscribers.get(key);
        if (subs) {
          subs.delete(trigger);
          if (subs.size === 0) subscribers.delete(key);
        }
      }
      subscribed.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);

  useEffect(() => {
    if (!visible || !refs || refs.length === 0) return;

    const stale = refs.filter(r => {
      if (typeof r.id !== "number" || r.id <= 0) return false;
      const key = `${r.kind}:${r.id}`;
      if (isFresh(key, r.kind)) return false;
      if (inflight.has(key)) return false;
      return true;
    });
    if (stale.length === 0) return;

    const batchKey = stale.map(r => `${r.kind}:${r.id}`).sort().join("|");
    let promise = inflight.get(batchKey);
    if (!promise) {
      promise = fetchEntities(stale).finally(() => {
        for (const r of stale) inflight.delete(`${r.kind}:${r.id}`);
        inflight.delete(batchKey);
      });
      inflight.set(batchKey, promise);
      for (const r of stale) inflight.set(`${r.kind}:${r.id}`, promise);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig, visible]);

  const out: Record<string, EntityCard> = {};
  for (const key of keys) {
    const entry = cache.get(key);
    if (entry && entry.card) out[key] = entry.card;
  }
  return out;
}

/** Internal: clear the entity cache. Exposed for tests. */
export function _resetEntityCacheForTests(): void {
  cache.clear();
  inflight.clear();
  subscribers.clear();
}
