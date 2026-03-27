# Mobile-First Redesign — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Approach:** Refactor in place — add mobile card rendering alongside existing table layout

## Context

TM War Room is used primarily on mobile phones or as a small browser window beside another app. The current mobile experience hides columns (Position, Revive, OC, Last Action, Xanax/Refills, Attacks Won) and uses horizontal scroll on the same table layout. This loses critical data and is inconvenient on narrow screens.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Our Team mobile layout | Hybrid cards — key data visible, tap-to-expand for details |
| Enemy Targets mobile layout | Aggressive cards — threat + Attack button on top, stats on expand |
| Header on mobile | Minimalist — war score in one line + hamburger menu |
| Sorting on mobile | Dropdown above card list ("Sort: Readiness ▾") |
| Responsive breakpoint | <768px = cards, ≥768px = table (desktop unchanged) |
| Implementation approach | Refactor in place — new render functions + CSS, desktop untouched |

## Our Team — Mobile Card Layout

### Collapsed State (default)

Two-line card showing all critical data without tapping:

```
┌─────────────────────────────────────────┐
│ 🟢 DarkKnight_TM  87              2m   │
│ Okay    ⚡ 348/150   💊 ready   🔄 OFF │
└─────────────────────────────────────────┘
```

**Line 1:** Status dot + Name (link to Torn profile) + Level + Relative time (last action)
**Line 2:** State + Energy (current/max) + Drug cooldown + Revive setting

Color coding:
- Energy: green when stacking (>max), blue normal, red low
- Drug CD: green "ready", red with countdown
- Revive: green "OFF", yellow "Fac", red "ALL"
- State: green "Okay", yellow "Hospital/Travel" with timer, gray "Offline"

### Bounty Button

Conditional — visible only when: active war + member is Offline + not in Hospital.

Position: in card header, between name and relative time. 28px min touch target. Copies "Can someone bounty {name}? {profile_url}" to clipboard with toast confirmation.

```
┌─────────────────────────────────────────┐
│ ⚫ GhostRunner  41            📋   3h  │
│ Offline    ⚡ —       💊 —      🔄 —   │
└─────────────────────────────────────────┘
```

### Expanded State (tap on card)

Border highlights (colored by status). Reveals a 2-column grid below the collapsed content:

```
┌─────────────────────────────────────────┐
│ 🟡 NightRaven  52                 18m   │
│ 🏥 2h 15m   ⚡ 22/150  💊 3h 40m 🔄 Fac│
│─────────────────────────────────────────│
│ Position: Council    Days: 142          │
│ OC: ✓ In OC         Last action: 18m   │
│ Hospital: Attacked by SomeEnemy         │
│                        View Profile ↗   │
└─────────────────────────────────────────┘
```

Expanded fields: Position, Days in faction, OC status, Last action (full), Hospital reason (if applicable), "View Profile ↗" link button.

Only one card expanded at a time — tapping a new card collapses the previously expanded one. This keeps the list scannable and prevents excessive vertical scrolling.

### Sort Dropdown

Above card list. Shows current sort + direction arrow. Tap opens native-style dropdown with options:
- Readiness (default — green first, then yellow, gray, red)
- Name (A-Z / Z-A)
- Level (high-low / low-high)
- Energy (high-low / low-high)
- State

Summary line next to dropdown: "42 online · 12 hospital" (uppercase, small, muted).

## Enemy Targets — Mobile Card Layout

### Collapsed State

Aggressive layout — threat assessment and attack capability at a glance:

```
┌─────────────────────────────────────────┐
│ 🟢 WeakTarget01  32        [easy 18]   │
│ Okay                          [Attack]  │
└─────────────────────────────────────────┘
```

**Line 1:** Status dot + Name + Level + Threat badge (colored: easy/green, medium/yellow, hard/red, avoid/purple)
**Line 2:** State (left) + Attack button (right, always visible)

Attack button: red background, 32px min height, prominent. Grayed out when enemy is in hospital (still clickable but visually muted).

### Expanded State (tap on card)

Full TornStats breakdown in 2-column grid:

```
┌─────────────────────────────────────────┐
│ 🟢 MidFighter  58        [medium 42]   │
│ Okay                          [Attack]  │
│─────────────────────────────────────────│
│ Xanax: 1,842       Refills: 312        │
│ SEs: 89            Atk won: 4,521      │
│ Def won: 187       Best streak: 342    │
│ NW: $2.1B          Best beaten: Lv 78  │
│ Last action: 8m    Damage: 18.2M       │
│                   [Stats ↗] [Profile ↗] │
└─────────────────────────────────────────┘
```

### Sort Dropdown

Same pattern as Our Team. Options:
- Threat (default — highest first)
- Name (A-Z / Z-A)
- Level (high-low / low-high)
- State

Summary line: "12 attackable · 8 hospital · 35 total"

## Header — Mobile Layout

### Active War State

Single compact line replacing full banner + progress bars + chain:

```
┌─────────────────────────────────────────┐
│ ⚔ RW  50 – 43  / 75    Chain: 15   ☰  │
└─────────────────────────────────────────┘
```

- War score: our score (green, bold) – their score (red, bold) / target (muted)
- Chain count inline if active
- Hamburger button (☰) on the right
- No progress bars on mobile — scores are sufficient
- Green-tinted background when war is active

### No War State

```
┌─────────────────────────────────────────┐
│ TM War Room                          ☰  │
└─────────────────────────────────────────┘
```

Simple title + hamburger.

### Hamburger Menu (dropdown on ☰ tap)

Full-width dropdown below header:

1. **User badge** — green dot + name + player ID
2. **Refresh** — with "Last: 30s ago" timestamp on the right
3. **Admin** — link to admin panel
4. **Theme toggle** — Dark/Light mode
5. **Logout** — red, at the bottom

All items: full-width, 44px+ min height for touch, rounded corners, clear visual separation.

No "Register API Key" button when already logged in (key is already registered at that point).

### Tabs

Below header, always visible (not in hamburger):

```
┌──────────────────┬───────────────────┐
│  Our Team (70)   │   Enemy (35)      │
└──────────────────┴───────────────────┘
```

Active tab: green text + green bottom border. Inactive: muted text. Badge with member count.

## Admin Panel — Mobile Layout

The admin panel (System, Keys, Usage cards) must be fully functional on mobile. Admin tasks will be performed on phone.

### System Card

Already responsive — grid stacks to 1fr on mobile. Integration badges wrap. No changes needed beyond what exists.

### Keys Card

The desktop table (Name, ID, Type, Registered, Remove) is 5 columns — too wide for mobile. On mobile, replace with card layout:

```
┌─────────────────────────────────────────┐
│ PlayerName                    [Remove]  │
│ ID: 12345 · personal · 2026-03-15      │
└─────────────────────────────────────────┘
```

Each key = one card. Name prominent, metadata in second line, Remove button always visible and touch-friendly (44px min height). Coverage progress bar stays above the key cards (already works on mobile).

### Usage Card

- **Bar chart**: Already responsive (height reduces to 60px on mobile). Keep as-is.
- **Range selector**: 7d/14d/30d buttons — already touch-friendly. Keep as-is.
- **Active Users table**: 3 columns (Name, Last Seen, Requests) — narrow enough to fit. Make font smaller (11px) and hide "Last Seen" column on mobile.
- **Errors table**: 4 columns (Endpoint, Status, Count, Last) — hide "Last" column on mobile.

### Tabs

The admin tab (`⚙ Admin`) uses `margin-left: auto` on desktop to push it right. On mobile, all three tabs should be equal width: `Our Team | Enemy | ⚙ Admin` with `flex: 1` each. Admin tab only visible for admin users (controlled by JS, unchanged).

## Desktop Layout

**No changes.** Breakpoint ≥768px renders existing table layout exactly as-is. The mobile card rendering is purely additive — a new code path that activates below 768px.

## Technical Approach

### Implementation: Refactor in Place

Add new functions alongside existing code. No rewrites.

**app.js changes:**
- New `renderMobileCards(members)` function for Our Team cards
- New `renderMobileEnemyCards(members)` function for Enemy cards
- New `renderMobileHeader()` function for compact header + hamburger
- New `renderMobileAdminKeys(data)` function for admin keys card layout on mobile
- Modify existing `renderMembers()` and `renderEnemy()` to branch: if `window.innerWidth < 768` → mobile cards, else → existing table
- Modify existing `renderAdminKeys()` to branch on mobile for card layout
- Modify existing `renderAdminUsage()` to hide columns on mobile via CSS classes
- Add `window.addEventListener('resize', ...)` to re-render on breakpoint crossing
- Card expand/collapse: toggle class on click, CSS transition for smooth open/close
- Sort dropdown: `<select>` element, onChange triggers re-sort + re-render

**style.css changes:**
- New `.member-card`, `.member-card-expanded`, `.enemy-card`, `.enemy-card-expanded` styles
- New `.mobile-header`, `.hamburger-menu`, `.sort-dropdown` styles
- New `.admin-key-card` styles for mobile admin keys
- New `@media (max-width: 767px)` block: hide table, show cards, show mobile header, hide desktop header, admin mobile tweaks
- New `@media (min-width: 768px)` block: hide cards, show table (existing behavior)
- Remove old `@media (max-width: 768px)` block that just hid columns — replaced by comprehensive mobile layout

**index.html changes:**
- Add card container divs (empty, populated by JS): `<div id="our-cards" class="mobile-only"></div>`, `<div id="enemy-cards" class="mobile-only"></div>`
- Add mobile header markup: `<div id="mobile-header" class="mobile-only"></div>`
- Add sort dropdown markup in both tab panes
- Existing table markup stays — just hidden on mobile via CSS

### File Impact

| File | Change Type | Scope |
|------|-------------|-------|
| `static/app.js` | Add functions | ~200 new lines (renderMobileCards, renderMobileEnemyCards, renderMobileHeader, renderMobileAdminKeys, card interactions) |
| `static/style.css` | Add styles | ~140 new lines (card styles, mobile header, hamburger, sort dropdown, admin mobile) |
| `static/index.html` | Add containers | ~20 new lines (card containers, mobile header div, sort dropdowns) |

No backend changes. No new files. No new dependencies.
