# TM Hub Session 3 Final Handoff — 2026-03-29

## Session stats
- **30+ commits**, 213 backend tests, 28+ frontend routes, 16 DB migrations
- Zero console errors in production

## What was built this session

### Major features
1. **Bounty threat levels** — easy/medium/hard/avoid badges, hospital filter, threat scoring from spy+personalstats
2. **FAQ page** (`/faq`) — 45 Q&As, 11 categories, community-researched from Torn Wiki/forums/Reddit
3. **Stock ROI calculator** — days to payback, annual ROI%, stock IDs verified against Torn API, only monetary benefits
4. **Travel profit calculator** — YATA abroad prices (real buy costs), 5% fee, $/hour, custom capacity (inc. 29), dedup
5. **OC Planner overhaul** — success parsing from status field, readiness tracking, CPR analysis, failure diagnosis
6. **Faction analytics** (`/analytics`) — top attackers leaderboard, daily attack chart, 7/14/30d periods
7. **Stat comparison** (`/compare`) — side-by-side player comparison with visual stat bars
8. **Attack activity timeline** — hourly bar chart on Chain Tracker "Activity" tab
9. **Awards circulation tracking** — daily snapshots stored in DB, scheduler job at 05:00 UTC, API endpoint ready

### Infrastructure & UX
10. **Sortable table columns** — reusable `useSort` hook + `SortableHeader` on 5+ pages
11. **CSV export** — reusable `ExportButton` on chain, stocks, awards, analytics
12. **PageExplainer** enhanced on all 17 pages — data sources, wiki links, educational content
13. **Dashboard quick-action cards** — easy bounties, OC status, NPC loot
14. **Sidebar reorganized** — FACTION / TOOLS / LEARN sections
15. **API key access validator** — tests stock access on login, warns if limited key
16. **Error boundary** — Try Again + Copy Error + Reload buttons
17. **Theme toggle fix** — classList.remove/add
18. **Logout fix** — full page redirect to clear state
19. **Travel item dedup** — by item_id, no more UK duplicates
20. **Login guidance** — "Full Access key required" with link to Torn settings

## Architecture

### Backend
- **FastAPI** with 17 routers, module-level state injection
- **SQLite** (WAL mode), 16 migrations, `BaseRepository` pattern
- **APScheduler 4.x** — 4 jobs: stats (4:00 UTC), circulation (5:00), spies (30min), data refresh (30s)
- **External APIs**: Torn v1/v2, TornStats (spy), YATA (travel export — needs User-Agent header)
- **httpx** AsyncClient with `User-Agent: TM-Hub/1.0` header

### Frontend
- **Next.js 15** static export, React 19, Tailwind v4
- **Chart.js** for stock price charts
- **Reusable components**: `useSort`, `SortableHeader`, `ExportButton`, `PageExplainer` (dataSources+links), `ErrorBoundary`
- **Auth**: Fernet-encrypted API keys, X-Player-Id header, localStorage state

### Key files
- `api/routers/stocks.py` — STOCK_PAYOUTS dict with verified IDs
- `api/routers/travel.py` — YATA integration, `response.stocks.{code}.stocks[]`
- `api/routers/bounties.py` — threat scoring with spy_service + personalstats
- `api/routers/oc.py` — success from status field ("Successful"/"Failed")
- `api/torn_client.py` — all external API calls, in-memory cache
- `frontend/src/hooks/useSort.ts` — generic sortable table hook
- `frontend/src/lib/csv-export.ts` — CSV download utility

## Remaining backlog

### Priority 1: Core features
1. **Company specials tracker** — research Torn API v2 `/company` endpoints. Show what specials each company type produces, when they refresh. New page `/company`.
2. **Browser push notifications** — Web Push API with VAPID keys. Backend: push_subscriptions table, notification dispatch on stakeout/war/loot events. Frontend: Service Worker registration, permission request.

### Priority 2: Polish
3. **Awards circulation chart** — frontend Chart.js component on award detail page. API endpoint already exists: `GET /api/awards/circulation/{kind}/{award_id}`. Data accumulates daily from scheduler job.
4. **Loading states audit** — verify every page has loading skeleton, error state, empty state. No blank screens.
5. **Caching improvements** — SQLite-backed cache instead of in-memory dict (resets on deploy).

### Nice to have
6. **Company employees page** — company details, employee stats
7. **Faction vs faction comparison** — compare two factions
8. **More educational content** — continuously improve PageExplainer bullets

## Deploy
```bash
# Commit (SSH signing disabled)
git -c commit.gpgsign=false commit -m "message"

# Push (SSH via 1Password doesn't work)
GIT_SSH_COMMAND="ssh -o IdentityFile=/dev/null -o IdentitiesOnly=yes" \
  git push https://pawelorzech:$(gh auth token)@github.com/pawelorzech/tm-war-room.git master
```

Push master → GitHub Actions (tests + build) → Coolify auto-deploy.
Coolify API token: `~/.config/coolify/credentials.json`, app UUID: `jut6hmgjyhv2bf8qpbahf92e`

## Mandatory post-deploy
After EVERY deploy: sanity check hub.tri.ovh with Playwright. Check /dashboard, /bounties, /travel, /stocks, /faq, /analytics. Check console for errors. See CLAUDE.md.

## Design philosophy
Every feature must HELP players make decisions. Explain WHY data matters, show data sources, teach game mechanics, highlight recommended actions. Never show empty screens without explanation.

## Env vars
| Variable | Required | Default |
|----------|----------|---------|
| `TORN_API_KEY` | yes | — |
| `ENCRYPTION_KEY` | yes (ephemeral) | — |
| `TORNSTATS_API_KEY` | no | — |
| `FACTION_ID` | no | 11559 |
| `CACHE_TTL` | no | 60 |
| `JWT_SECRET` | no (ephemeral) | — |
