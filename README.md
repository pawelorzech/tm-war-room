# TM Hub

Faction toolkit for **The Masters [TM]** in [Torn.com](https://www.torn.com). Full-featured alternative to YATA and TornStats for faction management.

Live at **[hub.tri.ovh](https://hub.tri.ovh)** (faction members only).

## Features

### Faction
- **Our Team** — live member status (online/offline, hospital timers, travel, jail), energy stacking, drug cooldowns, OC status, revive settings
- **Enemies** — auto-detect enemy from active Ranked War, threat scoring (relative to your stats via TornStats), attack buttons, sortable columns

### Training
- **Training Guide** — gym formula reference, happy jumping calculator, energy management, stat enhancers, rehab cost comparison (SE vs Xanax), merit/book/education perks — all auto-populated from API

### Tools
- **Stat Growth** — Chart.js line charts, 30-day growth cards, faction leaderboard
- **Market Scanner** — 14 tracked items with live prices, discount %, buy links
- **Spy Central** — player search (ID=live TornStats, name=local DB), faction lookup, submit spy form, admin CRUD
- **Chain Tracker** — auto-detected chains from attack data, per-member breakdown, bonus hits, recent attacks feed
- **Awards Tracker** — honors & medals progress, category filters, sortable table, detail subpage per award
- **Target Lists** — save/tag enemy targets with difficulty ratings, notes, quick attack links
- **NPC Loot Timers** — live loot levels from TornStats, countdown timers, reservation system for faction coordination
- **Revive Tracker** — revive leaderboard (given/received, success rate), recent revives feed
- **Stock Tracker** — portfolio with P/L calculations, benefit/dividend progress; market overview, price history
- **Travel Planner** — 11 countries with travel times, items abroad, current market prices, who's traveling
- **OC Planner** — organized crime status (planning/completed), participant roles, checkpoint pass rates
- **War Reports** — ranked war scores, raids, territory battles
- **Bounty Board** — active bounties sorted by reward, attack links to collect
- **Stakeout** — watch specific players, track status changes in real-time
- **Dashboard** — faction overview: online members, hospital, travelers, attacks, NPC loot, quick links
- **Faction Activity** — member status overview with online/idle/offline/hospital/traveling/jail filters

### Platform
- **Light/dark mode** — full theme toggle with CSS variables
- **Admin panel** — analytics dashboard, announcement editor, spy data management, admin roles
- **PageExplainer** — dismissible tutorial panel on every page
- **Admin refresh** — force data re-fetch button on all pages (admin only)
- **Mobile-first** — responsive sidebar + mobile drawer

## Stack

- **Backend:** Python 3.12, FastAPI, SQLite (WAL), httpx, APScheduler 4
- **Frontend:** Next.js 15 (static export), React 19, TypeScript, Tailwind CSS v4, Chart.js
- **Auth:** Torn API key → encrypted storage (Fernet) → X-Player-Id header
- **Integrations:** Torn API v1/v2, TornStats API, YATA API
- **Deploy:** Docker (multi-stage) → Coolify → Contabo VPS
- **Tests:** 202 backend pytest tests

## Architecture

```
api/
├── main.py              # FastAPI app, lifespan, middleware
├── config.py            # env vars
├── torn_client.py       # Torn/YATA/TornStats async client
├── threat.py            # threat scoring
├── auth.py              # JWT + rate limiting
├── admin.py             # admin panel router
├── db/
│   ├── __init__.py      # KeyStore facade
│   ├── migrations/      # 011 SQL migrations
│   └── repos/           # SQLite repositories
├── services/spy.py      # SpyService
├── routers/             # spy, stats, market, chain, awards, targets, loot, revives, stocks, travel, oc, wars
└── scheduler/           # APScheduler 4 background jobs

frontend/src/
├── app/                 # Next.js pages (18 routes)
├── components/          # React components by domain
├── hooks/               # useAuth, useWarData, useTeamData, etc.
├── lib/api-client.ts    # centralized API wrapper
└── types/               # TypeScript interfaces
```

## Development

```bash
# Backend
uv run pytest tests/ -v
TORN_API_KEY=xxx uvicorn api.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev    # dev server (port 3000)
cd frontend && npm run build  # static export (build test)
```

## Deploy

Push to `master` → GitHub Actions → Coolify auto-deploy → Docker build.

- Production: `hub.tri.ovh`
- Redirects: `rw.tri.ovh` → `/team`, `train.tri.ovh` → `/training`

## License

Private tool for The Masters faction. Not intended for general use.
