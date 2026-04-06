// frontend/src/hooks/usePinnedNav.ts
"use client";

import { useLocalStorage } from "./useLocalStorage";
import {
  DEFAULT_PINNED_HREFS,
  MAX_PINNED,
  ALL_NAV_ITEMS,
  DASHBOARD_ITEM,
} from "@/lib/nav-data";
import type { NavItem } from "@/lib/nav-data";

const STORAGE_KEY = "tmhub-pinned-hrefs";

export function usePinnedNav() {
  const [pinnedHrefs, setPinnedHrefs] = useLocalStorage<string[]>(
    STORAGE_KEY,
    DEFAULT_PINNED_HREFS,
  );

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
