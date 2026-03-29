# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TM Hub — Torn.com faction toolkit for The Masters [TM]. Monorepo: `api/` (FastAPI) + `frontend/` (Next.js 15 + React 19 + Tailwind v4).

## Commands

```bash
# Backend tests (79 tests, async)
uv run pytest tests/ -v
uv run pytest tests/test_threat.py -v          # single file
uv run pytest tests/test_routes.py -k "enemy"  # by keyword

# Frontend build (static export = the build test, no separate test suite)
cd frontend && npm run build

# Local dev
cd frontend && npm run dev                     # Next.js dev server (port 3000)
TORN_API_KEY=xxx uvicorn api.main:app --reload --port 8000  # backend

# Lint
cd frontend && npm run lint
```

## Architecture

### Backend (`api/`)

FastAPI app in `api/main.py` with module-level globals (`torn_client`, `key_store`) initialized in the `lifespan` context manager. Routers are wired via module-level state injection (e.g. `chain_mod.torn_client = torn_client`), not dependency injection.

- **`api/torn_client.py`** — async Torn API v1/v2 + YATA client with in-memory TTL cache
- **`api/db/`** — SQLite via `BaseRepository` pattern (`repos/base.py`): each repo gets a fresh `sqlite3.connect()` per call, WAL mode. `KeyStore` in `db/__init__.py` is a facade over `KeyRepository` + `AnnouncementRepository`
- **`api/db/migrations/`** — numbered SQL files (`001_*.sql`..`011_*.sql`) applied automatically by `runner.py` on startup against `data/keys.db`
- **`api/routers/`** — feature routers: spy, stats, market, chain, awards, targets, loot, revives
- **`api/admin.py`** — admin panel router (JWT-based admin auth, separate from member auth)
- **`api/scheduler/`** — APScheduler 4.x background jobs (stat collection daily 4:00 UTC, spy refresh every 30min)
- **`api/threat.py`** — threat scoring: relative (stat-based via spy estimates) or absolute (personalstats ratios)

All data lives in `data/keys.db` (created at runtime, gitignored).

### Frontend (`frontend/`)

Next.js 15 with `output: "export"` (static HTML). Built output goes to `frontend/out/`, copied to `static/` in Docker.

- **`src/lib/api-client.ts`** — centralized `apiFetch` wrapper; adds `X-Player-Id` header from localStorage, handles 401 auto-logout
- **`src/hooks/`** — data-fetching hooks per domain (`useWarData`, `useEnemyData`, `useTeamData`, `useAuth`, etc.)
- **`src/components/layout/`** — `AppShell` (sidebar + content), `AuthGate` (login wall), `Sidebar`, `MobileDrawer`
- **`src/types/`** — TypeScript interfaces matching API responses

### Auth flow

1. User POSTs Torn API key → backend validates faction membership via Torn API
2. Backend stores encrypted key (Fernet) in SQLite, returns `player_id`
3. Frontend stores `player_id` in localStorage, sends as `X-Player-Id` header on all API calls
4. Three roles: `superadmin` (hardcoded ID 2362436) > `admin` (DB flag) > `member`

### Deploy

Push to `master` → GitHub Actions runs tests + build → triggers Coolify deploy → Docker build (multi-stage: Node builds frontend, Python serves everything).

- Production: `hub.tri.ovh`
- Redirects: `rw.tri.ovh` → `/team`, `train.tri.ovh` → `/training`

## Env vars

| Variable | Required | Default |
|----------|----------|---------|
| `TORN_API_KEY` | yes | — |
| `ENCRYPTION_KEY` | yes (ephemeral if missing) | — |
| `TORNSTATS_API_KEY` | no | — |
| `FACTION_ID` | no | 11559 |
| `CACHE_TTL` | no | 60 |
| `JWT_SECRET` | no (ephemeral if missing) | — |

## Workflow

After each commit:
1. Run `/simplify` to review changed code for quality and efficiency
2. Fix any issues found
3. Push to master → auto-deploys via GitHub Actions + Coolify

## MANDATORY: Post-deploy sanity check

**After EVERY deploy to production**, you MUST do a browser walkthrough of hub.tri.ovh:
1. Open the site in Playwright (use `mcp__plugin_playwright_playwright__browser_navigate`)
2. Visit at least these pages and confirm they load data (not empty, no errors):
   - `/dashboard` — check member counts are > 0
   - `/team` — check members load
   - `/chain` — check chains or recent attacks show
   - `/awards` — check honors table loads
   - `/market` — check items load
   - `/loot` — check NPCs show with levels
   - `/stocks` — check portfolio or market data
   - `/bounties` — check data loads (if empty, check API logs)
3. Check browser console for errors (use `browser_console_messages`)
4. If ANY page shows empty data or errors → debug and fix BEFORE moving on
5. Take screenshots of key pages as evidence

This is non-negotiable. Real users depend on this. No shipping broken features.

## Testing notes

- Backend tests use `pytest-asyncio` with `asyncio_mode = "auto"` — all async test functions auto-detected
- `TornClient` is mocked in tests by replacing the `_http` attribute with a mock that returns canned responses
- Frontend has no test suite; `npm run build` (static export) serves as the build verification
