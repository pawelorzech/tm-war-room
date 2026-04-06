# Sidebar Redesign — Propozycja A

## Problem

The current sidebar has several issues:
1. **Pinned section is hardcoded** — no way to unpin items or customize
2. **Items are duplicated** — Dashboard and Our Team appear in both Pinned and Faction
3. **Miscategorized items** — Stat Growth and Awards are in Guides but are analytical tools
4. **Tools group is too large** — 12 items with no logical subdivision
5. **Categories don't reflect user mental model** — "Tools" mixes combat, economy, and utility

## Design

### New category structure

| Group | Items | Rationale |
|-------|-------|-----------|
| **Pinned** (dynamic, user-managed) | Default: Dashboard, Our Team, Chain Tracker | User's quick-access shortcuts |
| **Warfare** (8) | Enemies, Targets, Stakeout, Spy Central, Compare, Bounties, War Reports, Chain Tracker | All combat/PvP related |
| **Economy** (6) | Market, Stocks, NPC Loot, Revives, Travel, Companies | Money and resources |
| **Faction** (5) | Our Team, Activity, OC Planner, Analytics, Notifications | Faction management |
| **Training** (3) | Training Guide, Stat Growth, Awards | Player progression |
| **Resources** (2) | Userscripts, FAQ | Reference materials |

Dashboard is pinned by default but does not belong to any group — it's the app homepage, also accessible via TM Hub logo.

### Pin/unpin mechanism

**Interaction:**
- **Hover**: a small pin icon appears on the right side of any nav item; click to pin/unpin
- **Right-click**: context menu with "Pin to top" / "Unpin from top"
- Pin icon is semi-transparent (opacity ~0.3) on hover, solid when item is pinned

**Storage:** `localStorage` key `tmhub-pinned-hrefs` — array of href strings (e.g. `["/dashboard", "/team", "/chain"]`)

**Defaults:** New users get `["/dashboard", "/team", "/chain"]` as initial pins.

**Max pins:** 8 items. When user tries to pin a 9th, show a toast: "Unpin something first (max 8)".

**Pinned items still appear in their group** — pinning creates a shortcut at the top, it does not remove the item from its category. This avoids confusion about where items "went".

### Affected files

| File | Change |
|------|--------|
| `frontend/src/lib/nav-data.ts` | Replace `PINNED_ITEMS` + 3-group `NAV_GROUPS` with new 5-group structure. Export `DEFAULT_PINNED_HREFS`. Remove hardcoded `PINNED_ITEMS`. |
| `frontend/src/components/layout/Sidebar.tsx` | Use `useLocalStorage` for pinned state. Derive pinned items from all groups by matching hrefs. Add hover pin icon + right-click handler. |
| `frontend/src/components/nav/CollapsibleGroup.tsx` | Add pin icon on hover for each item. Add right-click context menu. Accept `onPin`/`onUnpin` callbacks + `pinnedHrefs` set. |
| `frontend/src/components/nav/BottomNavBar.tsx` | Update tab list to reflect new group IDs: Home, Warfare, Economy, Faction, Training, Resources, More. May need to collapse Training+Resources into a single "More" tab for space. |
| `frontend/src/components/nav/BottomSheet.tsx` | No structural changes needed — it renders whatever group it receives. |
| `frontend/src/components/nav/CommandPalette.tsx` | Update `searchNavItems` to reflect new group labels in results. |
| `frontend/src/lib/nav-data.ts` (`ALL_NAV_ITEMS`, `searchNavItems`, `findGroupForPath`) | These derive from `NAV_GROUPS` automatically — they'll update when groups change. |

### Mobile bottom nav consideration

Current bottom nav has 5 tabs: Home, Faction, Tools, Guides, More. With 5 new groups that's 7 tabs total (Home + 5 groups + More) — too many. Solution:

**Bottom nav tabs (6):** Home | Warfare | Economy | Faction | More

Training (3 items) and Resources (2 items) fold into "More" along with Inbox and Admin. This keeps the bottom bar to 5 tabs max.

### Context menu component

A lightweight `<ContextMenu>` component for right-click pin/unpin:
- Renders a positioned div on right-click
- Single action: "Pin to top" or "Unpin from top" depending on current state
- Closes on click outside or Escape
- No external dependencies

### Edge cases

- **User clears localStorage:** Falls back to `DEFAULT_PINNED_HREFS`
- **Pinned href no longer exists** (page removed): Silently filter it out when rendering
- **Empty pinned section:** Show subtle hint text "Right-click any item to pin it here"
