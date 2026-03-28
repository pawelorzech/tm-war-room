# TM Hub Session Handoff — 2026-03-28

## What was done this session

### Phase 0 — Foundation (completed)
- Modular backend: `api/db/repos/` (BaseRepository, KeyRepository, AnnouncementRepository, AnalyticsRepository, SpyRepository, StatSnapshotRepository, AttackRepository)
- SQL migration runner: `api/db/migrations/` (10 migrations, auto-applied on startup)
- Background scheduler: APScheduler 4 in `api/scheduler/` (stat collection daily 4 UTC, spy refresh every 30min)
- Services layer: `api/services/spy.py` (SpyService with best-estimate logic)
- Routers: `api/routers/spy.py`, `api/routers/stats.py`, `api/routers/market.py`, `api/routers/chain.py`

### UI Changes
- **War Room split** into `/team` (Our Team) and `/enemies` (Enemies). `/war` redirects to `/team`.
- **Training Guide**: horizontal tabs → left sidebar nav, rehab costs in SE vs Xanax comparison, all data from API (steadfast, education perks, book perks, merits)
- **Spy Central** (`/spy`): player search (ID=live TornStats, name=local DB), faction lookup, submit spy form, known stats table, admin CRUD (delete/block/hide)
- **Stat Growth** (`/stats`): Chart.js line chart, growth cards (30d), faction leaderboard, on-demand fetch on first visit
- **Market Scanner** (`/market`): 14 tracked items, live prices from Torn Item Market, discount %, buy links
- **Chain Tracker** (`/chain`): attack log ingestion (paginated up to 1000), per-member report, recent attacks, lost attacks highlighted red
- **PageExplainer**: dismissible tutorial panel on every page
- **ErrorBoundary**: crash handler with copyable stack trace
- **Performance**: war room load 16s → 1s (parallel bars fetch, YATA negative cache)

### Key fixes
- `api/db.py` removed (conflicted with `api/db/` package in Docker)
- Dockerfile: separate `pip install --pre` for APScheduler alpha (avoids httpx 1.0 dev)
- APScheduler 4: `configure_task` + `__aenter__` for proper init
- Admin JWT auto-refresh on 401
- Training stats: camelCase API keys, steadfast from faction_perks
- Fight Club removed from gym recommendations

## What needs to be done next

### 1. Chain Tracker Redesign (HIGH PRIORITY)
Current implementation uses "last X hours" time filter. User wants:
- **Chain-based view**: detect individual chains from attack data (chain resets = new chain). Show list of past chains with summary (total hits, respect, duration, top hitter).
- **Chain detail view**: click a chain → see all attacks in that chain, per-member breakdown, bonus hits, who started/ended it.
- **Keep "Recent Attacks" tab** showing last 100 hits.
- **Remove the hours-based time selector**.
- Chain detection logic: attacks have `chain` field (1, 2, 3...). When chain resets to 0 or 1 after being high, that's a new chain. Group attacks by chain sequences.

Files to modify:
- `api/routers/chain.py` — add chain detection logic, new endpoints
- `api/db/repos/attacks.py` — add queries for chain grouping
- `frontend/src/app/chain/page.tsx` — redesign UI

### 2. Light Mode (HIGH PRIORITY)
Currently broken. Dark colors hardcoded in `frontend/src/app/globals.css` under `@theme`. No light mode CSS variables exist. The theme toggle in sidebar (`useTheme` hook) changes HTML class but nothing responds to it.

Options:
- **A) Add light theme CSS variables** — duplicate the `@theme` block with light colors, scope with `.light` class
- **B) Remove the toggle** — simplest, dark-only
- User implied they want it fixed, so go with A.

File: `frontend/src/app/globals.css` — add light mode color overrides
File: `frontend/src/hooks/useTheme.ts` — already works (toggles `.dark`/`.light` on `<html>`)

Tailwind v4 approach: use `@theme` for dark (default), then override with `.light` selector:
```css
.light {
  --color-bg-primary: #ffffff;
  --color-bg-surface: #f6f8fa;
  /* etc. */
}
```

### 3. Remaining Feature List (in order)
3. Admin force refresh button on all pages
4. Awards tracker (Torn API: 532 honors, user has list of awarded IDs)
5. Target lists (save/tag targets for faction)
6. Loot timing (NPC loot timers)
7. Revive tracker
8. Stock tracker
9. Travel planner
10. OC planner
11. Company calc upgrade
12. War reports (history/timeline)
13. Adaptive polling (60s → 10-15s during war)

## Architecture Reference

### Backend
```
api/
├── main.py              # FastAPI app, lifespan, middleware, legacy routes
├── config.py            # env vars
├── torn_client.py       # Torn/YATA/TornStats API client
├── threat.py            # Threat scoring (stat-based + heuristic)
├── auth.py              # JWT + rate limiting
├── admin.py             # Admin router (/api/admin/*)
├── db/
│   ├── __init__.py      # KeyStore wrapper (backwards compat)
│   ├── migrations/      # 010 SQL migrations, runner.py
│   └── repos/           # base, keys, announcements, analytics, spies, stats, attacks
├── services/spy.py      # SpyService
├── routers/             # spy, stats, market, chain
└── scheduler/           # APScheduler 4, jobs: collect_stats, refresh_spies
```

### Frontend
```
frontend/src/app/
├── team/         — Our Team (faction members)
├── enemies/      — Enemy targets
├── training/     — Training Guide (sidebar nav)
├── spy/          — Spy Central
├── stats/        — Stat Growth
├── market/       — Market Scanner
├── chain/        — Chain Tracker
├── admin/        — Admin (Analytics, Announcements, Spy Data, Manage Admins)
├── inbox/        — Announcements
├── war/          — Redirect → /team
```

### Key env vars (Coolify)
TORN_API_KEY, TORNSTATS_API_KEY=***REDACTED***, ENCRYPTION_KEY, JWT_SECRET, FACTION_ID=11559

### Deploy
Push master → `curl -X POST admin.orzech.me/api/v1/applications/jut6hmgjyhv2bf8qpbahf92e/restart` with Coolify token from `~/.config/coolify/credentials.json`

### Tests
107 backend pytest tests. Frontend verified by `npm run build`.

### User preferences (from memory)
- User is Bombel [2362436], superadmin
- Delightful design required, mobile-first
- No Fight Club in gym recommendations (invite-only)
- All training calculator fields should auto-populate from API
- PageExplainer on every page (dismissible tutorial)
- Lost attacks highlighted red in chain tracker
- Admin should be able to force refresh data
