# Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 27-item flat sidebar with a hybrid navigation: slim sidebar with pinned items + collapsible groups + command palette on desktop, bottom tabs + bottom sheets on mobile. Deploy Umami analytics on Coolify.

**Architecture:** Navigation data centralized in `nav-data.ts`. Desktop sidebar restructured into Pinned + CollapsibleGroups + SearchBar. Mobile replaces hamburger drawer with iOS/Android-style bottom tab bar that opens bottom sheets per category. Command palette (Cmd+K) provides fuzzy search across all pages. Umami self-hosted on Coolify (analityka.tri.ovh) with a single script tag in layout.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, Umami (Docker on Coolify)

---

## File Structure

### New files
- `frontend/src/lib/nav-data.ts` — centralized navigation items, groups, pinned list
- `frontend/src/components/nav/SearchBar.tsx` — sidebar search trigger (desktop)
- `frontend/src/components/nav/CommandPalette.tsx` — Cmd+K modal with fuzzy search
- `frontend/src/components/nav/CollapsibleGroup.tsx` — expandable nav section with badge
- `frontend/src/components/nav/BottomNavBar.tsx` — 5-tab bottom bar (mobile)
- `frontend/src/components/nav/BottomSheet.tsx` — slide-up sheet with page grid
- `frontend/src/components/nav/MobileSearch.tsx` — fullscreen search overlay (mobile)
- `frontend/src/components/nav/InboxBadge.tsx` — inbox icon with unread count

### Modified files
- `frontend/src/components/layout/Sidebar.tsx` — full rewrite: pinned + groups + search
- `frontend/src/components/layout/AppShell.tsx` — remove MobileDrawer, add BottomNavBar, add Umami script
- `frontend/src/app/layout.tsx` — add Umami tracking script tag

### Removed files
- `frontend/src/components/layout/MobileDrawer.tsx` — replaced by BottomNavBar + BottomSheet

---

### Task 1: Navigation Data Module

**Files:**
- Create: `frontend/src/lib/nav-data.ts`

- [ ] **Step 1: Create nav-data.ts with types and data**

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

export const PINNED_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "🏠" },
  { label: "Our Team", href: "/team", icon: "👥" },
  { label: "Chain Tracker", href: "/chain", icon: "🔗" },
  { label: "Market", href: "/market", icon: "🛒" },
  { label: "Stocks", href: "/stocks", icon: "📉" },
  { label: "NPC Loot", href: "/loot", icon: "💰" },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "faction",
    label: "Faction",
    icon: "⚔️",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "🏠" },
      { label: "Our Team", href: "/team", icon: "👥" },
      { label: "Enemies", href: "/enemies", icon: "⚔️" },
      { label: "Activity", href: "/activity", icon: "🟢" },
      { label: "War Reports", href: "/wars", icon: "📊" },
      { label: "OC Planner", href: "/oc", icon: "🕴️" },
      { label: "Analytics", href: "/analytics", icon: "📈" },
      { label: "Notifications", href: "/notifications", icon: "🔔" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: "🔧",
    items: [
      { label: "Chain Tracker", href: "/chain", icon: "🔗" },
      { label: "Bounties", href: "/bounties", icon: "💵" },
      { label: "Targets", href: "/targets", icon: "🎯" },
      { label: "Stakeout", href: "/stakeout", icon: "👁️" },
      { label: "Spy Central", href: "/spy", icon: "🔍" },
      { label: "Compare", href: "/compare", icon: "⚖️" },
      { label: "NPC Loot", href: "/loot", icon: "💰" },
      { label: "Revives", href: "/revives", icon: "💚" },
      { label: "Market", href: "/market", icon: "🛒" },
      { label: "Stocks", href: "/stocks", icon: "📉" },
      { label: "Travel", href: "/travel", icon: "✈️" },
      { label: "Companies", href: "/company", icon: "🏢" },
    ],
  },
  {
    id: "guides",
    label: "Guides",
    icon: "📚",
    items: [
      { label: "Training Guide", href: "/training", icon: "💪" },
      { label: "Stat Growth", href: "/stats", icon: "📈" },
      { label: "Userscripts", href: "/scripts", icon: "🔧" },
      { label: "Awards", href: "/awards", icon: "🏆" },
      { label: "FAQ", href: "/faq", icon: "❓" },
    ],
  },
];

/** All nav items flattened and deduplicated by href — used by search/command palette */
export const ALL_NAV_ITEMS: NavItem[] = (() => {
  const seen = new Set<string>();
  const items: NavItem[] = [];
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
export function searchNavItems(query: string): Array<NavItem & { group: string }> {
  if (!query.trim()) return [];
  const results: Array<NavItem & { group: string }> = [];
  const seen = new Set<string>();
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

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds (unused module is tree-shaken, no errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/nav-data.ts
git commit -m "feat: centralized navigation data module with fuzzy search"
```

---

### Task 2: CollapsibleGroup Component

**Files:**
- Create: `frontend/src/components/nav/CollapsibleGroup.tsx`

- [ ] **Step 1: Create CollapsibleGroup component**

```tsx
// frontend/src/components/nav/CollapsibleGroup.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/nav-data";

interface CollapsibleGroupProps {
  group: NavGroup;
}

export function CollapsibleGroup({ group }: CollapsibleGroupProps) {
  const pathname = usePathname();
  const hasActivePage = group.items.some((item) => pathname.startsWith(item.href));
  const [open, setOpen] = useState(hasActivePage);

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
        <span className="text-[9px] transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
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
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  active
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/nav/CollapsibleGroup.tsx
git commit -m "feat: CollapsibleGroup component for sidebar sections"
```

---

### Task 3: InboxBadge Component

**Files:**
- Create: `frontend/src/components/nav/InboxBadge.tsx`

- [ ] **Step 1: Create InboxBadge component**

```tsx
// frontend/src/components/nav/InboxBadge.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface InboxBadgeProps {
  unreadCount: number;
}

export function InboxBadge({ unreadCount }: InboxBadgeProps) {
  const pathname = usePathname();
  const active = pathname.startsWith("/inbox");

  return (
    <Link
      href="/inbox"
      className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${
        active
          ? "bg-torn-green/10 text-torn-green"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
      }`}
      title="Inbox"
    >
      <span className="text-base">📨</span>
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[9px] bg-torn-green/20 text-torn-green px-1 rounded-full font-bold shadow-[0_0_8px_-2px_rgba(63,185,80,0.3)]"
          style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
        >
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/nav/InboxBadge.tsx
git commit -m "feat: InboxBadge component with unread count"
```

---

### Task 4: SearchBar + CommandPalette (Desktop)

**Files:**
- Create: `frontend/src/components/nav/SearchBar.tsx`
- Create: `frontend/src/components/nav/CommandPalette.tsx`

- [ ] **Step 1: Create SearchBar component (sidebar trigger)**

```tsx
// frontend/src/components/nav/SearchBar.tsx
"use client";

interface SearchBarProps {
  onOpen: () => void;
}

export function SearchBar({ onOpen }: SearchBarProps) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-2 mx-3 px-3 py-1.5 text-xs text-text-muted bg-bg-primary border border-border-light rounded-md hover:border-border hover:text-text-secondary transition-all duration-200"
      style={{ width: "calc(100% - 24px)" }}
    >
      <span className="text-text-muted">🔍</span>
      <span className="flex-1 text-left">Search...</span>
      <kbd className="hidden sm:inline text-[9px] bg-bg-elevated px-1.5 py-0.5 rounded border border-border-light font-mono">
        ⌘K
      </kbd>
    </button>
  );
}
```

- [ ] **Step 2: Create CommandPalette component**

```tsx
// frontend/src/components/nav/CommandPalette.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchNavItems } from "@/lib/nav-data";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = searchNavItems(query);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Global Cmd+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        } else {
          // Parent handles opening — this is just for the close toggle
        }
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const navigate = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
      if (typeof window !== "undefined" && (window as Record<string, unknown>).umami) {
        (window as Record<string, unknown> & { umami: { track: (event: string, data?: Record<string, string>) => void } }).umami.track("command-palette-nav", { to: href });
      }
    },
    [onClose, router],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      navigate(results[selectedIndex].href);
    }
  }

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        style={{ animation: "tm-fade-in 150ms ease-out" }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-bg-surface border border-border rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden"
        style={{ animation: "tm-fade-in 150ms ease-out" }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-text-muted">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          <kbd className="text-[9px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded border border-border-light font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-2">
          {query && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              No pages found
            </p>
          )}
          {results.map((item, i) => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100 ${
                i === selectedIndex
                  ? "bg-torn-green/10 text-text-primary"
                  : "text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              <span>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-[10px] text-text-muted">{item.group}</span>
            </button>
          ))}
          {!query && (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              Type to search all pages...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/nav/SearchBar.tsx frontend/src/components/nav/CommandPalette.tsx
git commit -m "feat: SearchBar trigger + CommandPalette with fuzzy search and keyboard nav"
```

---

### Task 5: Rewrite Desktop Sidebar

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx` (full rewrite)

- [ ] **Step 1: Rewrite Sidebar.tsx**

Replace entire contents of `frontend/src/components/layout/Sidebar.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { PINNED_ITEMS, NAV_GROUPS } from "@/lib/nav-data";
import { CollapsibleGroup } from "@/components/nav/CollapsibleGroup";
import { SearchBar } from "@/components/nav/SearchBar";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { InboxBadge } from "@/components/nav/InboxBadge";

interface SidebarProps {
  unreadCount?: number;
}

export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { playerName, playerId, role, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

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
            <div>
              <h1
                className="text-lg font-extrabold tracking-tight text-torn-green"
                style={{ animation: "tm-glow-pulse 4s ease-in-out infinite" }}
              >
                TM Hub
              </h1>
              <p className="text-[10px] text-text-muted tracking-wide">The Masters [TM]</p>
            </div>
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
            {PINNED_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  isActive(item.href)
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Collapsible groups */}
          {NAV_GROUPS.map((group) => (
            <CollapsibleGroup key={group.id} group={group} />
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

      {/* Command palette portal */}
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: rewrite Sidebar with pinned items, collapsible groups, search bar"
```

---

### Task 6: BottomSheet Component (Mobile)

**Files:**
- Create: `frontend/src/components/nav/BottomSheet.tsx`

- [ ] **Step 1: Create BottomSheet component**

```tsx
// frontend/src/components/nav/BottomSheet.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/nav-data";

interface BottomSheetProps {
  group: NavGroup | null;
  onClose: () => void;
}

export function BottomSheet({ group, onClose }: BottomSheetProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (group) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
      document.body.style.overflow = "hidden";
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 250);
      document.body.style.overflow = "";
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [group]);

  if (!visible || !group) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-250 ${
          animating ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-bg-surface border-t border-border rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] transition-transform duration-250 ease-out ${
          animating ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-3">
          <div className="w-8 h-1 bg-text-muted rounded-full" />
        </div>

        {/* Section title */}
        <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {group.label}
        </p>

        {/* Items grid */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-6 max-h-[60vh] overflow-y-auto">
          {group.items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-2 px-3 py-3 rounded-lg border text-sm transition-all duration-200 ${
                  active
                    ? "bg-torn-green/10 border-torn-green/30 text-text-primary"
                    : "bg-bg-primary border-border-light text-text-secondary hover:border-border"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/nav/BottomSheet.tsx
git commit -m "feat: BottomSheet component for mobile navigation"
```

---

### Task 7: MobileSearch Component

**Files:**
- Create: `frontend/src/components/nav/MobileSearch.tsx`

- [ ] **Step 1: Create MobileSearch component**

```tsx
// frontend/src/components/nav/MobileSearch.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchNavItems } from "@/lib/nav-data";

interface MobileSearchProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSearch({ open, onClose }: MobileSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = searchNavItems(query);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-bg-primary lg:hidden"
      style={{ animation: "tm-fade-in 150ms ease-out" }}
    >
      {/* Search header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
        <span className="text-text-muted">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages..."
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        <button
          onClick={onClose}
          className="text-sm text-text-secondary hover:text-text-primary px-2 py-1"
        >
          Cancel
        </button>
      </div>

      {/* Results */}
      <div className="overflow-y-auto" style={{ height: "calc(100vh - 48px)" }}>
        {query && results.length === 0 && (
          <p className="px-4 py-8 text-sm text-text-muted text-center">
            No pages found
          </p>
        )}
        {results.map((item) => (
          <button
            key={item.href}
            onClick={() => navigate(item.href)}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-elevated transition-colors border-b border-border-light/30"
          >
            <span className="text-base">{item.icon}</span>
            <div className="flex-1 text-left">
              <span className="text-text-primary">{item.label}</span>
            </div>
            <span className="text-[10px] text-text-muted">{item.group}</span>
          </button>
        ))}
        {!query && (
          <p className="px-4 py-8 text-sm text-text-muted text-center">
            Type to search all pages...
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/nav/MobileSearch.tsx
git commit -m "feat: MobileSearch fullscreen overlay for mobile"
```

---

### Task 8: BottomNavBar Component (Mobile)

**Files:**
- Create: `frontend/src/components/nav/BottomNavBar.tsx`

- [ ] **Step 1: Create BottomNavBar component**

This is the 5-tab bar at the bottom of the screen on mobile. Home navigates directly, other tabs open BottomSheet, More opens a sheet with Inbox/Admin.

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

const MORE_GROUP: NavGroup = {
  id: "more",
  label: "More",
  icon: "•••",
  items: [
    { label: "Inbox", href: "/inbox", icon: "📨" },
    { label: "Admin", href: "/admin", icon: "⚙️" },
  ],
};

export function BottomNavBar({ unreadCount = 0, role }: BottomNavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeSheet, setActiveSheet] = useState<NavGroup | null>(null);

  // Filter "More" items based on role
  const moreGroup: NavGroup = {
    ...MORE_GROUP,
    items: MORE_GROUP.items.filter((item) => {
      if (item.href === "/admin") return role && role !== "member";
      return true;
    }),
  };

  const tabs = [
    { id: "home", label: "Home", icon: "🏠", action: () => router.push("/dashboard") },
    ...NAV_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      icon: g.icon,
      action: () => setActiveSheet((prev) => (prev?.id === g.id ? null : g)),
    })),
    {
      id: "more",
      label: "More",
      icon: "•••",
      action: () => setActiveSheet((prev) => (prev?.id === "more" ? null : moreGroup)),
    },
  ];

  function isTabActive(tabId: string): boolean {
    if (tabId === "home") return pathname.startsWith("/dashboard");
    if (tabId === "more") return ["/inbox", "/admin"].some((p) => pathname.startsWith(p));
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

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/nav/BottomNavBar.tsx
git commit -m "feat: BottomNavBar with 5 tabs and bottom sheet integration"
```

---

### Task 9: Rewrite AppShell — Wire Everything Together

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx` (rewrite)

- [ ] **Step 1: Rewrite AppShell.tsx**

Replace entire contents of `frontend/src/components/layout/AppShell.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { AuthGate } from "./AuthGate";
import { ErrorBoundary } from "./ErrorBoundary";
import { Sidebar } from "./Sidebar";
import { AnnouncementCarousel } from "./AnnouncementCarousel";
import { BottomNavBar } from "@/components/nav/BottomNavBar";
import { MobileSearch } from "@/components/nav/MobileSearch";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncements } from "@/hooks/useAnnouncements";

function ShellContent({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, role } = useAuth();
  const { active, unreadCount, dismiss } = useAnnouncements();
  const [searchOpen, setSearchOpen] = useState(false);

  if (!isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed top-0 left-0 w-[200px] h-full z-40">
        <Sidebar unreadCount={unreadCount} />
      </div>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-12 bg-bg-surface/80 backdrop-blur-md border-b border-border z-40 flex items-center px-3 gap-3">
        <span
          className="text-sm font-extrabold tracking-tight text-torn-green"
          style={{ textShadow: "0 0 12px rgba(63, 185, 80, 0.35)" }}
        >
          TM Hub
        </span>
        <div className="flex-1" />
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-elevated transition-all duration-200"
          aria-label="Search"
        >
          <span className="text-base">🔍</span>
        </button>
        {/* Inbox */}
        <a
          href="/inbox"
          className="relative text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-elevated transition-all duration-200"
        >
          <span className="text-base">📨</span>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green/20 text-torn-green px-1 rounded-full font-bold">
              {unreadCount}
            </span>
          )}
        </a>
      </div>

      {/* Mobile search overlay */}
      <MobileSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Mobile bottom nav */}
      <BottomNavBar unreadCount={unreadCount} role={role} />

      {/* Main content */}
      <main className="lg:ml-[200px] pt-12 lg:pt-0 pb-20 lg:pb-0 min-h-screen flex flex-col">
        <AnnouncementCarousel announcements={active} onDismiss={dismiss} />
        <ErrorBoundary>
          <div className="flex-1">{children}</div>
        </ErrorBoundary>
        <footer className="px-4 py-3 text-text-muted text-[10px] text-center border-t border-border">
          TM Hub v1.0.0 — by{" "}
          <a
            href="https://www.torn.com/profiles.php?XID=2362436"
            target="_blank"
            className="text-torn-green hover:underline"
          >
            Bombel [2362436]
          </a>
        </footer>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ShellContent>{children}</ShellContent>
    </AuthGate>
  );
}
```

Key changes:
- Removed hamburger menu button — no more MobileDrawer
- Added search icon + inbox icon to mobile header
- Added `MobileSearch` overlay
- Added `BottomNavBar` for mobile
- Added `pb-20 lg:pb-0` to main content to account for bottom nav bar height
- Passed `role` to BottomNavBar for Admin visibility

- [ ] **Step 2: Delete MobileDrawer.tsx**

```bash
rm frontend/src/components/layout/MobileDrawer.tsx
```

- [ ] **Step 3: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no references to MobileDrawer

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git rm frontend/src/components/layout/MobileDrawer.tsx
git commit -m "feat: wire new nav — BottomNavBar, MobileSearch, remove MobileDrawer"
```

---

### Task 10: Add Umami Tracking Script

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Add Umami script tag to layout.tsx**

Edit `frontend/src/app/layout.tsx` — add a `<Script>` tag for Umami. Use `next/script` with `strategy="afterInteractive"` so it doesn't block rendering.

Replace entire contents of `frontend/src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "TM Hub",
  description: "Torn.com faction toolkit for The Masters",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="min-h-full bg-bg-primary text-text-primary">
        <AppShell>{children}</AppShell>
        <Script
          src="https://analityka.tri.ovh/script.js"
          data-website-id=""
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
```

Note: The `data-website-id` will be filled in after deploying Umami (Task 11). Leave it empty for now — the script will gracefully no-op without a valid ID.

The `viewport` export with `viewportFit: "cover"` enables `env(safe-area-inset-bottom)` on iPhones for the bottom nav bar.

- [ ] **Step 2: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/layout.tsx
git commit -m "feat: add Umami analytics script and viewport safe-area support"
```

---

### Task 11: Deploy Umami on Coolify

**Files:**
- None (infrastructure task)

This task deploys Umami as a new service on Coolify at analityka.tri.ovh.

- [ ] **Step 1: Read Coolify API credentials**

```bash
cat ~/.config/coolify/credentials.json
```

- [ ] **Step 2: Create Umami service on Coolify**

Use Coolify API to create a new Docker Compose service. Umami requires a PostgreSQL database.

```bash
# Create a new service using Coolify API
# Umami official Docker image: ghcr.io/umami-software/umami:postgresql-latest
# It needs a Postgres DB (can use Coolify's built-in Postgres service)

COOLIFY_TOKEN=$(jq -r '.token' ~/.config/coolify/credentials.json)
COOLIFY_URL="https://admin.orzech.me"

# List available servers to find the right one
curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_URL/api/v1/servers" | jq '.[].uuid'
```

- [ ] **Step 3: Deploy Umami via Coolify UI or API**

Since Coolify service creation via API can be complex, the recommended path is:

1. Open Coolify dashboard at https://admin.orzech.me
2. Create new Resource → Docker Compose
3. Use this compose configuration:

```yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    environment:
      DATABASE_URL: postgresql://umami:umami@db:5432/umami
      APP_SECRET: <generate-random-secret>
    depends_on:
      db:
        condition: service_healthy
    restart: always

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: umami
    volumes:
      - umami-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U umami"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: always

volumes:
  umami-db:
```

4. Set domain to `analityka.tri.ovh`
5. Deploy

- [ ] **Step 4: Configure Umami**

1. Open https://analityka.tri.ovh
2. Login with default credentials (admin/umami) — **change password immediately**
3. Go to Settings → Websites → Add website
4. Name: "TM Hub", URL: "https://hub.tri.ovh"
5. Copy the `data-website-id` value

- [ ] **Step 5: Update layout.tsx with website ID**

Edit `frontend/src/app/layout.tsx` and fill in the `data-website-id`:

```tsx
<Script
  src="https://analityka.tri.ovh/script.js"
  data-website-id="<paste-id-here>"
  strategy="afterInteractive"
/>
```

- [ ] **Step 6: Add custom event tracking to CommandPalette and BottomNavBar**

In `frontend/src/components/nav/CommandPalette.tsx`, the `navigate` function already includes a `umami.track` call. Verify it works by checking the Umami dashboard after navigating via Cmd+K.

Add tracking to BottomNavBar tab taps. Edit `frontend/src/components/nav/BottomNavBar.tsx` — in each tab's `action`, add:

```typescript
// Add to each tab action (except home which is just router.push)
if (typeof window !== "undefined" && (window as any).umami) {
  (window as any).umami.track("bottom-tab-tap", { tab: tabId });
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/components/nav/CommandPalette.tsx frontend/src/components/nav/BottomNavBar.tsx
git commit -m "feat: configure Umami analytics with website ID and custom events"
```

---

### Task 12: Visual Polish + Build Verification

**Files:**
- Modify: `frontend/src/app/globals.css` (add bottom-sheet animation if needed)

- [ ] **Step 1: Add safe-area CSS to globals.css**

Add at the end of `frontend/src/app/globals.css`:

```css
/* ── Bottom nav safe area (iPhone home indicator) ── */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

- [ ] **Step 2: Run full build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint
```

Expected: No new lint errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "fix: add safe-area CSS for iPhone bottom nav"
```

---

### Task 13: Deploy + Post-Deploy Sanity Check

**Files:** None (deployment task)

- [ ] **Step 1: Push to master**

```bash
git push origin master
```

This triggers GitHub Actions → Coolify deploy.

- [ ] **Step 2: Wait for deploy to complete**

Check GitHub Actions status:

```bash
gh run list --limit 1
```

Wait for it to complete.

- [ ] **Step 3: Run mandatory post-deploy browser sanity check**

Open hub.tri.ovh in Playwright and verify:
1. Desktop: sidebar shows Pinned items, collapsible groups work, Cmd+K opens palette
2. Mobile (resize to 375px): bottom nav bar visible, tabs open bottom sheets, search works
3. All core pages load data: /dashboard, /team, /chain, /market, /stocks, /loot
4. No console errors
5. Umami script loads (check network tab for analityka.tri.ovh/script.js)

- [ ] **Step 4: Take screenshots as evidence**

Screenshot desktop sidebar, mobile bottom nav, command palette, and bottom sheet.

- [ ] **Step 5: Verify Umami is receiving data**

Open https://analityka.tri.ovh and confirm page views are being recorded.
