# TM Hub Session Handoff — 2026-03-29

## What was done this session

### New Pages (9 new routes)
- **Chain Tracker redesign** — auto-detect chains from attack data, clickable chain cards with details, per-member breakdown, bonus hits. Removed hours-based selector.
- **Awards Tracker** — table view with categories, sortable columns, search, Incomplete tab. Detail subpage at `/awards/detail?kind=&id=` with honor bar image, rarity, circulation, earned date.
- **Target Lists** (`/targets`) — CRUD for enemy targets with tags, difficulty ratings, notes, attack links. Shared across faction.
- **NPC Loot Timers** (`/loot`) — live loot levels from TornStats, countdown timers, level bars. **Reservation system**: claim NPCs at desired loot level, auto-reset when NPC hospitalized.
- **Revive Tracker** (`/revives`) — leaderboard (given/received, success rate) + recent revives feed.
- **Stock Tracker** (`/stocks`) — portfolio with P/L, benefit/dividend progress; market overview with all stocks.
- **Travel Planner** (`/travel`) — 11 countries with travel times, items abroad, live market prices.
- **OC Planner** (`/oc`) — planning/completed crimes, participant roles, CPR. Player names resolved from member lookup.
- **War Reports** (`/wars`) — ranked war scores, raids, territory battles. Resilient parsing.

### Market Scanner Overhaul
- Fetches ALL items via bulk endpoint (not per-item)
- Default "Top 20 Profit" view
- Filter: Top 20 / All Profitable / Tradeable / All Items
- Tax toggle (0/2/5/10%) for net profit calculation
- Type filter dropdown, search, sortable columns

### Platform Features
- **Light mode** — CSS variables for full theme support
- **Admin force refresh** — `RefreshButton` on all pages (admin/superadmin only)
- **Background scheduler** — refreshes ALL data every 30s with war-aware adaptive polling (more frequent during active war)
- **`/api/status` endpoint** — returns war_active, poll_interval, refresh_cycle
- **Company auto-detect** — training guide auto-populates company from API

### Bug Fixes
- Admin panel crash (useMemo after conditional return violated hook rules)
- Chain labels: "Chain #N (X hits logged)" not misleading "N-hit chain"
- Announcement banners theme-adaptive for light/dark mode
- NPC loot: TornStats returns NPCs at top level, not under 'loot' key
- Awards tab switching: replaced chained useMemo with single compute function
- Incoming attacks highlighted red in chain tracker (defender from our faction)
- War reports: resilient parsing handles both dict and list formats

### Architecture Changes
- **12 routers** now: spy, stats, market, chain, awards, targets, loot, revives, stocks, travel, oc, wars
- **12 SQL migrations** (added: targets, loot_reservations)
- **Background scheduler**: refresh_data job (30s cycle, war-aware), plus existing collect_stats (daily) and refresh_spies (30min)
- Frontend: 18 routes, sidebar has 13 nav items under FACTION/TRAINING/TOOLS

## What needs to be done next

### 1. Awards Detail Page Enhancement
Current: basic detail page at `/awards/detail`. User wants it to fully replicate TornStats honor page — needs circulation charts (requires storing historical data) and better image handling.

### 2. NPC Loot Reservation Polish
- Auto-reset works but needs testing in production
- Consider adding notification when NPC reaches target level

### 3. OC Planner Enhancement
- Verify player names resolve correctly after deploy
- Add CPR color coding, planning progress indicators

### 4. General Polish
- Review all pages on mobile
- Test light mode across all pages
- Add loading skeletons instead of text "Loading..."

### 5. Future Features (from user)
- NPC loot notification system (alert when NPC reaches desired level)
- Historical data storage for awards circulation charts
- Improved market scanner with real-time market listings (per-item)
- War timeline/replay visualization

## Key Env Vars
TORN_API_KEY, TORNSTATS_API_KEY=TS_skXIryO5jWYGOOYv, ENCRYPTION_KEY, JWT_SECRET, FACTION_ID=11559

## Deploy
Push master → `curl -X POST admin.orzech.me/api/v1/applications/jut6hmgjyhv2bf8qpbahf92e/restart` with Coolify token from `~/.config/coolify/credentials.json`

Note: Contabo DNS sometimes can't resolve github.com — retry deploy if it fails with "Could not resolve host".

## User Preferences (from this session)
- Wants data refreshed in background always, not on-demand
- Prefers nicknames over IDs everywhere
- Awards should have internal detail pages, not redirect to TornStats
- Market should default to "top profitable" view, not show everything
- Good with table layouts (awards, market, revives)
