// frontend/src/hooks/usePinnedNav.ts
"use client";

import { useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { useAuth } from "./useAuth";
import { api } from "@/lib/api-client";
import {
  DEFAULT_PINNED_HREFS,
  MAX_PINNED,
  ALL_NAV_ITEMS,
} from "@/lib/nav-data";
import type { NavItem } from "@/lib/nav-data";

const STORAGE_KEY = "tmhub-pinned-hrefs";
const MIGRATED_KEY = "tmhub-pinned-migrated-v1";

export function usePinnedNav() {
  const { playerId } = useAuth();
  const [pinnedHrefs, setPinnedHrefs] = useLocalStorage<string[]>(
    STORAGE_KEY,
    DEFAULT_PINNED_HREFS,
  );
  const lastSyncedRef = useRef<string | null>(null);

  // On login, fetch favorites from server. If the server is empty and we have
  // localStorage favorites, migrate them up. Otherwise, server wins so the
  // user sees the same pins across devices.
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    (async () => {
      try {
        const { hrefs } = await api.pinnedNavsGet();
        if (cancelled) return;
        if (hrefs.length === 0) {
          const migrated = typeof window !== "undefined" && localStorage.getItem(MIGRATED_KEY) === "1";
          if (!migrated && pinnedHrefs.length > 0) {
            const { hrefs: confirmed } = await api.pinnedNavsPut(pinnedHrefs);
            if (cancelled) return;
            lastSyncedRef.current = JSON.stringify(confirmed);
            try { localStorage.setItem(MIGRATED_KEY, "1"); } catch { /* ignore */ }
            setPinnedHrefs(confirmed);
          }
        } else {
          lastSyncedRef.current = JSON.stringify(hrefs);
          try { localStorage.setItem(MIGRATED_KEY, "1"); } catch { /* ignore */ }
          setPinnedHrefs(hrefs);
        }
      } catch {
        // Offline / 401 — keep localStorage value, hook keeps working.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // Push local changes to server (debounced via the lastSynced check).
  useEffect(() => {
    if (!playerId) return;
    const next = JSON.stringify(pinnedHrefs);
    if (next === lastSyncedRef.current) return;
    lastSyncedRef.current = next;
    api.pinnedNavsPut(pinnedHrefs).catch(() => { /* swallow — try again on next change */ });
  }, [playerId, pinnedHrefs]);

  const pinnedSet = new Set(pinnedHrefs);

  /** Resolve hrefs to NavItems, filtering out stale hrefs */
  const pinnedItems: NavItem[] = pinnedHrefs
    .map((href) => ALL_NAV_ITEMS.find((item) => item.href === href))
    .filter((item): item is NavItem => item !== undefined);

  function pin(href: string) {
    if (pinnedSet.has(href)) return;
    if (pinnedHrefs.length >= MAX_PINNED) return;
    setPinnedHrefs([...pinnedHrefs, href]);
  }

  function unpin(href: string) {
    setPinnedHrefs(pinnedHrefs.filter((h) => h !== href));
  }

  function isPinned(href: string): boolean {
    return pinnedSet.has(href);
  }

  function isFull(): boolean {
    return pinnedHrefs.length >= MAX_PINNED;
  }

  return { pinnedItems, pin, unpin, isPinned, isFull };
}
