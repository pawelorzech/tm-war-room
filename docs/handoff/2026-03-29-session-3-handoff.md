# TM Hub Session 3 Handoff — 2026-03-29

## What was done (22 commits)

### New features
- **Bounty threat levels** — easy/medium/hard/avoid per target, hospital filter, threat filter buttons
- **FAQ page** (`/faq`) — 45 Q&As across 11 categories, community-researched from Torn Wiki/forums
- **Stock ROI calculator** — days to payback, annual ROI%, only monetary benefits, IDs verified against Torn API
- **Travel profit calculator** — YATA abroad prices, 5% fee, $/hour, custom capacity (inc. button 29), deduplicated items
- **OC Planner overhaul** — readiness tracking, success parsing fix, CPR analysis, failure diagnosis
- **Attack activity timeline** — hourly bar chart + stats table on Chain Tracker "Activity" tab
- **Dashboard quick-action cards** — easy bounties count, OC planning status, NPC loot
- **Sortable table columns** — on bounties, stocks, market, awards, loot (useSort hook + SortableHeader component)
- **Sidebar reorganization** — FACTION / TOOLS / LEARN sections

### Improvements
- **PageExplainer** enhanced on all 17 pages — data sources, wiki links, educational bullets
- **Theme toggle** fixed (classList.remove/add)
- **Login page** — specifies Full Access key, links to Torn API settings
- **Logout** — full page redirect instead of setState
- **Travel dedup** — items deduplicated by item_id
- **Stock portfolio** — catches "access denied", shows helpful error
- **Market item links** — added item ID parameter

### Backend
- `fetch_user_profile_stats()` — any player's personalstats by ID
- `fetch_yata_travel_stocks()` — YATA abroad prices, cached 15min
- `get_activity_timeline()` — hourly attack buckets
- `/api/chain/timeline` — configurable hours
- `/api/stocks/roi` — ROI endpoint with payout values
- `/api/bounties` — threat scoring + target status
- User-Agent header on httpx client (YATA 403 fix)
- OC success parsing from status field
- 11 new tests (213 total)

## Architecture

- **17 routers**, **15 migrations**, **26+ frontend routes**
- **Sidebar**: FACTION (Dashboard, Team, Enemies, Activity, Wars, OC, Notifications) → TOOLS (Chain, Bounties, Targets, Stakeout, Spy, Loot, Revives, Market, Stocks, Travel) → LEARN (Training, Stats, Awards, FAQ)
- **YATA integration**: travel export, needs User-Agent header, `response.stocks.{code}.stocks[]`
- **Stock IDs**: verified, STOCK_PAYOUTS in `api/routers/stocks.py`
- **Reusable components**: `useSort` hook, `SortableHeader`, `PageExplainer` (with dataSources + links props)

## What needs to be done next

### Priority 1: Core features
1. **Company specials tracker** — Torn API v2 company endpoints, special items, production schedules
2. **Awards circulation charts** — historical DB table + scheduler job + Chart.js line chart
3. **Browser push notifications** — Service Worker, Web Push API, VAPID keys, push subscription table

### Priority 2: Player tools
4. **Stat comparison tool** — side-by-side player comparison, radar chart
5. **Faction analytics** — contribution trends, activity heatmap, attack frequency charts
6. **CSV data export** — download buttons for attack logs, stats, portfolio

### Priority 3: Polish
7. **API key access validator** — test key permissions on login, show feature availability
8. **Error boundary component** — catch rendering errors, show friendly retry UI
9. **Loading states audit** — ensure no blank screens anywhere
10. **Caching improvements** — persistent cache (Redis/SQLite) instead of in-memory

## Key env vars
TORN_API_KEY, TORNSTATS_API_KEY, ENCRYPTION_KEY, JWT_SECRET, FACTION_ID=11559

## Deploy
Push master → GitHub Actions (tests + build) → Coolify auto-deploy.
API token: `~/.config/coolify/credentials.json`, app UUID: `jut6hmgjyhv2bf8qpbahf92e`

## Git push workaround
```bash
git -c commit.gpgsign=false commit -m "message"
GIT_SSH_COMMAND="ssh -o IdentityFile=/dev/null -o IdentitiesOnly=yes" git push https://pawelorzech:$(gh auth token)@github.com/pawelorzech/tm-war-room.git master
```

## Mandatory post-deploy
After EVERY deploy: Playwright sanity check of hub.tri.ovh (see CLAUDE.md). Check /dashboard, /team, /chain, /bounties, /stocks, /travel, /faq. Check console for errors.

## Design philosophy
Every feature must HELP players make decisions, not just display data. Explain WHY data matters, show data sources, teach game mechanics, highlight recommended actions. See CLAUDE.md.
