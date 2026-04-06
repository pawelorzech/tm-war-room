# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize sidebar into 5 domain-based groups (Warfare, Economy, Faction, Training, Resources) with dynamic user-managed pin/unpin via hover icon + right-click context menu.

**Architecture:** Replace hardcoded `PINNED_ITEMS` with `useLocalStorage`-backed dynamic pins. Restructure `NAV_GROUPS` from 3 groups (Faction/Tools/Guides) to 5 domain groups. Add `ContextMenu` component and pin affordances to `CollapsibleGroup`. Update mobile `BottomNavBar` to match new groups.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, localStorage

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/lib/nav-data.ts` | Modify | New 5-group structure, `DEFAULT_PINNED_HREFS`, remove `PINNED_ITEMS` |
| `frontend/src/components/layout/Sidebar.tsx` | Modify | Dynamic pinned section from localStorage, pin icon in pinned items |
| `frontend/src/components/nav/CollapsibleGroup.tsx` | Modify | Hover pin icon + right-click on each item, accept pin callbacks |
| `frontend/src/components/nav/ContextMenu.tsx` | Create | Lightweight right-click context menu for pin/unpin |
| `frontend/src/hooks/usePinnedNav.ts` | Create | Custom hook wrapping useLocalStorage for pin state + helpers |
| `frontend/src/components/nav/BottomNavBar.tsx` | Modify | Update tabs for new group structure (5 tabs) |

---

### Task 1: Update nav-data.ts — new group structure

**Files:**
- Modify: `frontend/src/lib/nav-data.ts:1-125`

- [ ] **Step 1: Replace PINNED_ITEMS and NAV_GROUPS**

Replace the entire file content with:

```typescript
// frontend/src/lib/nav-data.ts

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

/** Default pinned hrefs for new users */
export const DEFAULT_PINNED_HREFS: string[] = [
  "/dashboard",
  "/team",
  "/chain",
];

export const MAX_PINNED = 8;

export const DASHBOARD_ITEM: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: "🏠",
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "warfare",
    label: "Warfare",
    icon: "⚔️",
    items: [
      { label: "Enemies", href: "/enemies", icon: "⚔️" },
      { label: "Targets", href: "/targets", icon: "🎯" },
      { label: "Stakeout", href: "/stakeout", icon: "👁️" },
      { label: "Spy Central", href: "/spy", icon: "🔍" },
      { label: "Compare", href: "/compare", icon: "⚖️" },
      { label: "Bounties", href: "/bounties", icon: "💵" },
      { label: "War Reports", href: "/wars", icon: "📊" },
      { label: "Chain Tracker", href: "/chain", icon: "🔗" },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    icon: "💰",
    items: [
      { label: "Market", href: "/market", icon: "🛒" },
      { label: "Stocks", href: "/stocks", icon: "📉" },
      { label: "NPC Loot", href: "/loot", icon: "💰" },
      { label: "Revives", href: "/revives", icon: "💚" },
      { label: "Travel", href: "/travel", icon: "✈️" },
      { label: "Companies", href: "/company", icon: "🏢" },
    ],
  },
  {
    id: "faction",
    label: "Faction",
    icon: "👥",
    items: [
      { label: "Our Team", href: "/team", icon: "👥" },
      { label: "Activity", href: "/activity", icon: "🟢" },
      { label: "OC Planner", href: "/oc", icon: "🕴️" },
      { label: "Analytics", href: "/analytics", icon: "📈" },
      { label: "Notifications", href: "/notifications", icon: "🔔" },
    ],
  },
  {
    id: "training",
    label: "Training",
    icon: "💪",
    items: [
      { label: "Training Guide", href: "/training", icon: "💪" },
      { label: "Stat Growth", href: "/stats", icon: "📈" },
      { label: "Awards", href: "/awards", icon: "🏆" },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    icon: "📚",
    items: [
      { label: "Userscripts", href: "/scripts", icon: "🔧" },
      { label: "FAQ", href: "/faq", icon: "❓" },
    ],
  },
];

/** All nav items flattened and deduplicated by href — used by search/command palette */
export const ALL_NAV_ITEMS: NavItem[] = (() => {
  const seen = new Set<string>();
  const items: NavItem[] = [DASHBOARD_ITEM];
  seen.add(DASHBOARD_ITEM.href);
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!seen.has(item.href)) {
        seen.add(item.href);
        items.push(item);
      }
    }
  }
  return items;
})();

/** Find which group a path belongs to */
export function findGroupForPath(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => pathname.startsWith(item.href))) {
      return group.id;
    }
  }
  return null;
}

/** Simple fuzzy match — checks if all query chars appear in order in the target */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Search nav items with fuzzy matching, return with group labels */
export function searchNavItems(
  query: string,
): Array<NavItem & { group: string }> {
  if (!query.trim()) return [];
  const results: Array<NavItem & { group: string }> = [];
  const seen = new Set<string>();
  // Include dashboard
  if (fuzzyMatch(query, DASHBOARD_ITEM.label)) {
    results.push({ ...DASHBOARD_ITEM, group: "Home" });
    seen.add(DASHBOARD_ITEM.href);
  }
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!seen.has(item.href) && fuzzyMatch(query, item.label)) {
        seen.add(item.href);
        results.push({ ...item, group: group.label });
      }
    }
  }
  return results;
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds (will have type errors in Sidebar.tsx referencing removed `PINNED_ITEMS` — that's expected, we fix it in Task 3)

Actually, build will fail because `Sidebar.tsx` imports `PINNED_ITEMS`. We'll fix that in Task 3. For now, just save the file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/nav-data.ts
git commit -m "refactor: reorganize nav groups into warfare/economy/faction/training/resources"
```

---

### Task 2: Create usePinnedNav hook

**Files:**
- Create: `frontend/src/hooks/usePinnedNav.ts`

- [ ] **Step 1: Create the hook**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/usePinnedNav.ts
git commit -m "feat: add usePinnedNav hook for dynamic pin/unpin with localStorage"
```

---

### Task 3: Create ContextMenu component

**Files:**
- Create: `frontend/src/components/nav/ContextMenu.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/nav/ContextMenu.tsx
"use client";

import { useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  isPinned: boolean;
  isFull: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  isPinned,
  isFull,
  onPin,
  onUnpin,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 200,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[160px] bg-bg-surface border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)] py-1 overflow-hidden"
    >
      {isPinned ? (
        <button
          onClick={() => {
            onUnpin();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors duration-150"
        >
          <span className="text-xs">📌</span>
          <span>Unpin from top</span>
        </button>
      ) : (
        <button
          onClick={() => {
            onPin();
            onClose();
          }}
          disabled={isFull}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 ${
            isFull
              ? "text-text-muted cursor-not-allowed"
              : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
          }`}
        >
          <span className="text-xs">📌</span>
          <span>{isFull ? "Pinned is full (max 8)" : "Pin to top"}</span>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/nav/ContextMenu.tsx
git commit -m "feat: add ContextMenu component for pin/unpin right-click"
```

---

### Task 4: Update CollapsibleGroup with pin affordances

**Files:**
- Modify: `frontend/src/components/nav/CollapsibleGroup.tsx:1-65`

- [ ] **Step 1: Rewrite CollapsibleGroup**

Replace the entire file:

```tsx
// frontend/src/components/nav/CollapsibleGroup.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ContextMenu } from "./ContextMenu";
import type { NavGroup } from "@/lib/nav-data";

interface CollapsibleGroupProps {
  group: NavGroup;
  isPinned: (href: string) => boolean;
  isFull: () => boolean;
  onPin: (href: string) => void;
  onUnpin: (href: string) => void;
}

interface MenuState {
  x: number;
  y: number;
  href: string;
}

export function CollapsibleGroup({
  group,
  isPinned,
  isFull,
  onPin,
  onUnpin,
}: CollapsibleGroupProps) {
  const pathname = usePathname();
  const hasActivePage = group.items.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(hasActivePage);
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Auto-expand when navigating to a page in this group
  useEffect(() => {
    if (hasActivePage) setOpen(true);
  }, [hasActivePage]);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors duration-200"
      >
        <span
          className="text-[9px] transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▶
        </span>
        <span>{group.label}</span>
        <span className="ml-auto text-[9px] bg-bg-elevated px-1.5 py-0.5 rounded-full">
          {group.items.length}
        </span>
      </button>

      {open && (
        <div
          className="overflow-hidden"
          style={{ animation: "tm-expand 200ms ease-out" }}
        >
          {group.items.map((item) => {
            const active = pathname.startsWith(item.href);
            const pinned = isPinned(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, href: item.href });
                }}
                className={`group/item flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  active
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pinned ? onUnpin(item.href) : onPin(item.href);
                  }}
                  className={`text-[10px] transition-opacity duration-150 ${
                    pinned
                      ? "opacity-40 hover:opacity-70"
                      : "opacity-0 group-hover/item:opacity-30 hover:!opacity-70"
                  }`}
                  title={pinned ? "Unpin" : "Pin to top"}
                >
                  📌
                </button>
              </Link>
            );
          })}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          isPinned={isPinned(menu.href)}
          isFull={isFull()}
          onPin={() => onPin(menu.href)}
          onUnpin={() => onUnpin(menu.href)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/nav/CollapsibleGroup.tsx
git commit -m "feat: add pin icon on hover + right-click context menu to CollapsibleGroup"
```

---

### Task 5: Update Sidebar to use dynamic pins

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx:1-144`

- [ ] **Step 1: Rewrite Sidebar**

Replace the entire file:

```tsx
// frontend/src/components/layout/Sidebar.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { usePinnedNav } from "@/hooks/usePinnedNav";
import { NAV_GROUPS, DASHBOARD_ITEM } from "@/lib/nav-data";
import { CollapsibleGroup } from "@/components/nav/CollapsibleGroup";
import { ContextMenu } from "@/components/nav/ContextMenu";
import { SearchBar } from "@/components/nav/SearchBar";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { InboxBadge } from "@/components/nav/InboxBadge";

interface SidebarProps {
  unreadCount?: number;
}

interface MenuState {
  x: number;
  y: number;
  href: string;
}

export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { playerName, playerId, role, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { pinnedItems, pin, unpin, isPinned, isFull } = usePinnedNav();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const isActive = (href: string) => pathname.startsWith(href);

  // Global Cmd+K to open palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <>
      <div className="flex flex-col h-full bg-bg-surface border-r border-border">
        {/* Header */}
        <div className="p-4 pb-3 border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-2">
            <Link href="/dashboard">
              <h1
                className="text-lg font-extrabold tracking-tight text-torn-green"
                style={{ animation: "tm-glow-pulse 4s ease-in-out infinite" }}
              >
                TM Hub
              </h1>
              <p className="text-[10px] text-text-muted tracking-wide">
                The Masters [TM]
              </p>
            </Link>
            <InboxBadge unreadCount={unreadCount} />
          </div>
          <SearchBar onOpen={() => setPaletteOpen(true)} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {/* Pinned items */}
          <div className="mb-2">
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-0.5">
              Pinned
            </p>
            <div className="mx-3 border-b border-border-light/50 mb-1" />
            {pinnedItems.length === 0 && (
              <p className="px-4 py-2 text-[11px] text-text-muted italic">
                Right-click any item to pin it here
              </p>
            )}
            {pinnedItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, href: item.href });
                }}
                className={`group/pin flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  isActive(item.href)
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    unpin(item.href);
                  }}
                  className="text-[10px] opacity-0 group-hover/pin:opacity-40 hover:!opacity-70 transition-opacity duration-150"
                  title="Unpin"
                >
                  📌
                </button>
              </Link>
            ))}
          </div>

          {/* Collapsible groups */}
          {NAV_GROUPS.map((group) => (
            <CollapsibleGroup
              key={group.id}
              group={group}
              isPinned={isPinned}
              isFull={isFull}
              onPin={pin}
              onUnpin={unpin}
            />
          ))}

          {/* Admin */}
          {role && role !== "member" && (
            <div className="mt-2">
              <Link
                href="/admin"
                className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  isActive("/admin")
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>⚙️</span>
                <span>Admin</span>
              </Link>
            </div>
          )}
        </nav>

        {/* User panel */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 mb-2 group">
            <div className="w-7 h-7 rounded-full bg-torn-green-dim text-white text-xs font-bold flex items-center justify-center ring-2 ring-transparent group-hover:ring-torn-green/40 transition-all duration-200">
              {playerName?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {playerName || "Unknown"}
              </p>
              <p className="text-[10px] text-text-muted">
                [{playerId || "..."}]
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="text-xs text-text-secondary hover:text-text-primary transition-all duration-200 px-2 py-1 rounded hover:bg-bg-elevated"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
            <button
              onClick={logout}
              className="text-xs text-text-secondary hover:text-torn-red transition-all duration-200 px-2 py-1 rounded hover:bg-bg-elevated ml-auto"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Context menu for pinned items */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          isPinned={isPinned(menu.href)}
          isFull={isFull()}
          onPin={() => pin(menu.href)}
          onUnpin={() => unpin(menu.href)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Command palette portal */}
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: dynamic pinned section with hover unpin + right-click menu"
```

---

### Task 6: Update BottomNavBar for new groups

**Files:**
- Modify: `frontend/src/components/nav/BottomNavBar.tsx:1-97`

- [ ] **Step 1: Rewrite BottomNavBar**

The bottom nav gets 5 tabs: Home, Warfare, Economy, Faction, More (Training + Resources + Inbox + Admin fold into More).

Replace the entire file:

```tsx
// frontend/src/components/nav/BottomNavBar.tsx
"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav-data";
import { BottomSheet } from "./BottomSheet";
import type { NavGroup } from "@/lib/nav-data";

interface BottomNavBarProps {
  unreadCount?: number;
  role?: string | null;
}

export function BottomNavBar({ unreadCount = 0, role }: BottomNavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeSheet, setActiveSheet] = useState<NavGroup | null>(null);

  // Main groups shown as direct tabs
  const mainGroups = NAV_GROUPS.filter((g) =>
    ["warfare", "economy", "faction"].includes(g.id),
  );

  // Smaller groups folded into "More"
  const foldedGroups = NAV_GROUPS.filter((g) =>
    ["training", "resources"].includes(g.id),
  );

  const moreItems = [
    ...foldedGroups.flatMap((g) => g.items),
    { label: "Inbox", href: "/inbox", icon: "📨" },
    ...(role && role !== "member"
      ? [{ label: "Admin", href: "/admin", icon: "⚙️" }]
      : []),
  ];

  const moreGroup: NavGroup = {
    id: "more",
    label: "More",
    icon: "•••",
    items: moreItems,
  };

  const tabs = [
    {
      id: "home",
      label: "Home",
      icon: "🏠",
      action: () => router.push("/dashboard"),
    },
    ...mainGroups.map((g) => ({
      id: g.id,
      label: g.label,
      icon: g.icon,
      action: () => setActiveSheet((prev) => (prev?.id === g.id ? null : g)),
    })),
    {
      id: "more",
      label: "More",
      icon: "•••",
      action: () =>
        setActiveSheet((prev) => (prev?.id === "more" ? null : moreGroup)),
    },
  ];

  function isTabActive(tabId: string): boolean {
    if (tabId === "home") return pathname.startsWith("/dashboard");
    if (tabId === "more") {
      return moreGroup.items.some((item) => pathname.startsWith(item.href));
    }
    const group = NAV_GROUPS.find((g) => g.id === tabId);
    return group?.items.some((item) => pathname.startsWith(item.href)) ?? false;
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border bg-bg-surface/95 backdrop-blur-md">
        <div className="flex">
          {tabs.map((tab) => {
            const active = isTabActive(tab.id);
            return (
              <button
                key={tab.id}
                onClick={tab.action}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors duration-200 relative ${
                  active ? "text-torn-green" : "text-text-muted"
                }`}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
                {tab.id === "more" && unreadCount > 0 && (
                  <span
                    className="absolute top-1 right-1/4 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green/20 text-torn-green px-1 rounded-full font-bold"
                    style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Safe area padding for iPhones with home indicator */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      <BottomSheet group={activeSheet} onClose={() => setActiveSheet(null)} />
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/nav/BottomNavBar.tsx
git commit -m "feat: update bottom nav tabs for warfare/economy/faction + more"
```

---

### Task 7: Full build verification and final commit

**Files:** None (verification only)

- [ ] **Step 1: Run full frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with static export

- [ ] **Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 3: Run backend tests to verify nothing broke**

Run: `uv run pytest tests/ -v`
Expected: All 79+ tests pass (backend is unaffected but verify anyway)

- [ ] **Step 4: Verify .superpowers is gitignored**

Check if `.superpowers/` is in `.gitignore`. If not, add it:

```bash
echo ".superpowers/" >> frontend/.gitignore
# or project root .gitignore — wherever gitignore lives
```
