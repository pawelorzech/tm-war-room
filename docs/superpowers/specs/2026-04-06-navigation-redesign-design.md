# Navigation Redesign — TM Hub

## Problem

Current sidebar has 27 items in 3 flat sections (FACTION/TOOLS/GUIDES). Users must scroll to see all items. No hierarchy — everything looks equally important. Two-level nesting in Training Guide area feels clunky. No analytics to inform decisions.

## Solution: Hybrid B+C

Slim sidebar with pinned favorites + collapsible groups + command palette on desktop. Bottom navigation bar with bottom sheets on mobile. Self-hosted Umami analytics to track usage.

---

## 1. Page Structure

### Pinned (always visible, top 6 — hardcoded v1)
- Dashboard
- Our Team
- Chain Tracker
- Market
- Stocks
- NPC Loot

### Faction (8 items)
Dashboard, Our Team, Enemies, Activity, War Reports, OC Planner, Analytics, Notifications

### Tools (12 items)
Chain Tracker, Bounties, Targets, Stakeout, Spy Central, Compare, NPC Loot, Revives, Market, Stocks, Travel, Companies

### Guides (5 items)
Training Guide, Stat Growth, Userscripts, Awards, FAQ

### Outside groups
- **Inbox** — icon + badge in header area (not buried in menu)
- **Admin** — bottom of sidebar (desktop) / "More" tab (mobile), admin/superadmin only

Pages intentionally repeat across Pinned and their logical group. User sees favorites on top and finds them logically in their category.

---

## 2. Desktop Sidebar (200px width)

### Layout (top to bottom)
1. **Logo** — "TM Hub" + "The Masters [TM]"
2. **Search bar** — click or Cmd+K opens command palette modal. Shows "Search... ⌘K" placeholder
3. **Pinned section** — 6 items, always expanded, never collapses. Active page highlighted with green border-left
4. **Collapsible groups** — FACTION / TOOLS / GUIDES headers with badge showing item count
   - Default state: all collapsed
   - Click header to toggle expand/collapse
   - Active group auto-expands when user is on a page from that group
   - Multiple groups can be open simultaneously
5. **Inbox** — icon with unread badge, placed next to the search bar (top area, high visibility)
6. **User panel** — avatar, name, player ID, Dark/Light toggle, Logout

### Sidebar width
200px — same as current, unchanged.

---

## 3. Mobile Layout

### Top header (48px)
- Left: "TM Hub" logo
- Right: Search icon (🔍) + Inbox icon with badge + user avatar
- Tap avatar → dropdown with Logout, Dark/Light toggle

### Bottom navigation bar (5 tabs)
- **Home** (🏠) — direct navigation to Dashboard
- **Faction** (⚔️) — tap opens bottom sheet with Faction pages
- **Tools** (🔧) — tap opens bottom sheet with Tools pages
- **Guides** (📚) — tap opens bottom sheet with Guides pages
- **More** (•••) — tap opens bottom sheet with Inbox, Admin (if role permits), Settings

### Bottom sheet behavior
- Slides up from bottom, rounded top corners, dimmed backdrop
- Drag handle on top (swipe down to close)
- Pages in 2-column grid — large touch targets (min 44px height)
- Tap page → navigate + sheet closes
- Active page highlighted

### Mobile search
- Tap 🔍 → fullscreen search overlay
- Input auto-focused, keyboard opens immediately
- Live results while typing, grouped by section
- "Cancel" button to close

### No hamburger menu
Bottom tabs replace the current MobileDrawer component. The drawer is removed.

---

## 4. Command Palette (Desktop only)

### Trigger
- Cmd+K (Mac) / Ctrl+K (Windows)
- Click on search bar in sidebar

### Behavior
- Centered modal with backdrop blur, ~500px wide
- Text input at top, results below
- Fuzzy search — "tra" matches "Training Guide" and "Travel"
- Results grouped by section label (e.g., "Guides" next to "Training Guide")
- Arrow key navigation, Enter = navigate
- Escape = close

### Scope (v1)
- Navigation between pages only (27 items)
- No actions (logout, theme toggle, etc.)

### Mobile equivalent
Fullscreen search via 🔍 tap — same fuzzy matching, different presentation.

---

## 5. Analytics — Umami

### Hosting
- Self-hosted Umami on Coolify
- Domain: analityka.tri.ovh

### What we track
- **Page views** — which page, when, duration
- **Navigation patterns** — from → to, which Pinned items clicked most
- **Device breakdown** — mobile vs desktop (verify 50/50 assumption)
- **Command palette usage** — frequency, search terms
- **Bottom sheet usage** — which tab on mobile is most popular
- **Referrer** — where users come from (Torn forum, Discord, direct)

### What we do NOT track
- No personal player data (player_id, API key, stats)
- No cookies — Umami works cookieless
- No fingerprinting

### Integration
- Single `<script>` tag in `layout.tsx`
- Custom events via `umami.track()` for command palette opens, bottom sheet tab taps, search queries (anonymized)

### How we use the data
- Popular pages → verify/adjust Pinned selection
- Mobile vs desktop ratio → prioritize platform
- Most expanded sections → consider promoting items to Pinned

---

## 6. Components to Create/Modify

### New components
- `CommandPalette.tsx` — modal with fuzzy search, keyboard nav
- `BottomNavBar.tsx` — 5-tab bottom bar for mobile
- `BottomSheet.tsx` — slide-up sheet with page grid
- `MobileSearch.tsx` — fullscreen search overlay
- `SearchBar.tsx` — sidebar search trigger (desktop)
- `CollapsibleGroup.tsx` — expandable nav section with badge

### Modified components
- `Sidebar.tsx` — restructured: search bar + pinned + collapsible groups + inbox + user panel
- `AppShell.tsx` — add BottomNavBar for mobile, remove MobileDrawer reference, add Umami script
- `layout.tsx` — add Umami tracking script

### Removed components
- `MobileDrawer.tsx` — replaced by BottomNavBar + BottomSheet

---

## 7. Navigation Data Structure

```typescript
interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: string; // for bottom tab
  items: NavItem[];
}

const PINNED_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "🏠" },
  { label: "Our Team", href: "/team", icon: "👥" },
  { label: "Chain Tracker", href: "/chain", icon: "🔗" },
  { label: "Market", href: "/market", icon: "🛒" },
  { label: "Stocks", href: "/stocks", icon: "📉" },
  { label: "NPC Loot", href: "/loot", icon: "💰" },
];

const NAV_GROUPS: NavGroup[] = [
  {
    id: "faction",
    label: "Faction",
    icon: "⚔️",
    items: [/* 8 items */],
  },
  {
    id: "tools",
    label: "Tools",
    icon: "🔧",
    items: [/* 12 items */],
  },
  {
    id: "guides",
    label: "Guides",
    icon: "📚",
    items: [/* 5 items */],
  },
];
```

---

## 8. Out of Scope

- Personalized pinned items (user picks favorites) — v2
- Command palette actions beyond navigation — v2
- Umami dashboard customization — post-deploy
- Drag-and-drop reordering of pinned items — v2
