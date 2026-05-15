# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TM Hub — Torn.com faction toolkit for The Masters [TM]. Monorepo: `api/` (FastAPI) + `frontend/` (Next.js 16 + React 19 + Tailwind v4). Production runs gunicorn with 2 uvicorn workers behind nginx; Redis (`tm-hub-redis` in Coolify) provides shared chat pub/sub, scheduler leader-election, and rate-limit state.

## Commands

```bash
# Backend tests (~516 tests, async)
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
- **`api/db/migrations/`** — numbered SQL files (`001_*.sql`..`041_*.sql`) applied automatically by `runner.py` on startup against `data/keys.db`
- **`api/routers/`** — 22 feature routers: spy, stats, market, chain, awards, targets, loot, revives, bounties, stocks, travel, oc, wars, stakeout, notifications, company, company_director, push, admin_push, version, armoury, chat
- **`api/armoury.py`** — armoury competition logic: item category sets, `matches_competition()` for deposit filtering, `parse_deposit_news()` for Torn news parsing
- **`api/routers/market.py`** has `ensure_items_cache()` — shared async function that populates/returns the Torn items cache (all ~1600 items). Reusable from other routers (e.g. armoury item search).
- **`api/admin.py`** — admin panel router (JWT-based admin auth, separate from member auth)
- **`api/scheduler/`** — APScheduler 4.x background jobs (11 total: data refresh 30s, stat collection 15min, spy refresh 30min, circulation 15min, armoury 5min, revive 10min, avatars 12h, company snapshots/discovery/trains 24h, encrypted DB backup 24h)
- **`api/threat.py`** — threat scoring: relative (stat-based via spy estimates) or absolute (personalstats ratios)

All data lives in `data/keys.db` (created at runtime, gitignored).

### Frontend (`frontend/`)

Next.js 15 with `output: "export"` (static HTML). Built output goes to `frontend/out/`, copied to `static/` in Docker.

- **`src/lib/api-client.ts`** — centralized `apiFetch` wrapper; adds `X-Player-Id` header from localStorage, handles 401 auto-logout
- **`src/hooks/`** — data-fetching hooks per domain (`useWarData`, `useEnemyData`, `useTeamData`, `useAuth`, etc.)
- **`src/components/layout/`** — `AppShell` (sidebar + banner + footer), `AuthGate` (login wall), `Sidebar` (desktop, collapsible groups with pin/unpin)
- **`src/components/nav/`** — `BottomNavBar` + `BottomSheet` (mobile), `CollapsibleGroup`, `SearchBar`, `CommandPalette` (Cmd+K)
- **`src/data/changelog.ts`** — `CURRENT_VERSION` + `CHANGELOG` entries (source of truth for versioning)
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
| `ENCRYPTION_KEY` | yes (fails in prod, ephemeral in dev) | — |
| `TORNSTATS_API_KEY` | no | — |
| `FACTION_ID` | no | 11559 |
| `CACHE_TTL` | no | 60 |
| `JWT_SECRET` | yes (fails in prod, ephemeral in dev) | — |
| `SUPERADMIN_IDS` | no | `2362436` (Bombel). Comma-separated allowlist for break-glass — `2362436,<backup>` |
| `BACKUP_ENCRYPTION_KEY` | recommended in prod | Fernet key for daily keys.db backups (F-18). Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. **Store outside Coolify** so a Coolify compromise alone cannot decrypt backups. |
| `BACKUP_RETENTION_DAYS` | no | `30` |
| `B2_APPLICATION_KEY_ID` / `B2_APPLICATION_KEY` / `B2_BUCKET_NAME` / `B2_PUBLIC_URL` | no | Backblaze B2 credentials (used by avatar refresh + F-18 backups). |
| `REDIS_URL` | recommended (prod) | — | `redis://default:<pw>@<host>:6379/0`. When set: chat broadcasts go cross-worker via pub/sub, scheduler picks one leader cluster-wide, rate limits are shared. When unset: falls back to per-worker state (works for `WEB_CONCURRENCY=1`). |
| `WEB_CONCURRENCY` | no | `2` | gunicorn worker count. Multi-worker requires `REDIS_URL` for chat to fan out cross-worker. |
| `SENTRY_DSN` | no | — | Sentry/Glitchtip DSN. When set: error events + 5% trace sampling go to the observability backend. When unset: no-op (`api/observability.py`). PII filter scrubs Torn API keys, `Authorization` headers, cookies, and any secret-named field before transmission (tests in `tests/test_observability.py`). |
| `SENTRY_TRACES_SAMPLE_RATE` | no | `0.05` | Trace sample rate. `0` disables performance traces; errors still go through. |
| `NEXT_PUBLIC_SENTRY_DSN` | build-time | — | Browser-side DSN. Same scrubber as backend (`frontend/src/lib/sentry-browser.ts`). When set the SDK chunk (~20 KB gzip) is dynamically imported after page load. |

## Versioning

TM Hub uses semantic versioning. The source of truth is `frontend/src/data/changelog.ts`.

On each deploy with user-facing changes:
1. Bump `CURRENT_VERSION` in `frontend/src/data/changelog.ts`
2. Add a new entry at the **top** of the `CHANGELOG` array with version, date, title, and changes
3. Version rules: patch (1.0.X) = bugfix, minor (1.X.0) = new feature, major (X.0.0) = breaking change
4. Change types: `feat` = new feature, `fix` = bugfix, `improve` = enhancement to existing feature

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

## Design philosophy

Every feature must HELP players, not just display data:
- **Explain WHY data matters** — don't just show numbers, explain what they mean for gameplay decisions
- **Show data sources** — tell users where data comes from (Torn API, TornStats, cached, estimated)
- **Teach the game** — every page should have educational content: how mechanics work, what strategies to use, links to wiki/forums for deeper learning
- **Help decisions** — highlight what action the player should take based on the data
- **Be a backup** — cache data from external services (TornStats, YATA) so players have access even when those services are down
- **Build trust** — no broken pages, no empty data without explanation, always show loading/error states clearly

When building a new feature:
1. Research the game mechanic on Torn Wiki, forums, Reddit
2. Understand WHY a player would want this data
3. Build the feature with educational context (not just raw data)
4. Add data source attribution and useful external links
5. Test with real data before deploying

## Security architecture

- **Middleware auth** (`main.py:enforce_api_auth`): JWT + mandatory X-Player-Id on all `/api/*` except `PUBLIC_API_PATHS` and `/api/admin/*`. Admin routes have their own auth via `require_admin` dependency.
- **Rate limiting**: shared `rate_limiter` singleton in `api/auth.py` — reuse for any new rate limits (don't create per-module rate limiters)
- **Security headers**: CSP, HSTS, Permissions-Policy, X-Frame-Options set in middleware. CSP allows `analityka.tri.ovh` (Umami), `*.backblazeb2.com` (avatars), `www.torn.com` (images).
- **Secrets**: `ENCRYPTION_KEY` and `JWT_SECRET` fail-fast in production (`APP_VERSION != "dev"`), ephemeral in dev/test
- **MCP auth**: bearer token with `hmac.compare_digest`, returns 404 if secret not configured

## Gotchas

- **Router state injection**: when adding a dependency (e.g. `key_store`) to a router, wire it in BOTH `main.py` lifespan AND test fixtures
- **Middleware vs admin auth**: `/api/admin/*` bypasses `enforce_api_auth` middleware — admin endpoints rely solely on `require_admin` dependency
- **Dependency audit**: run `uv run pip-audit` and `cd frontend && npm audit` before releases
- **Torn API v1 vs v2 — read `docs/torn-api-v2-migration.md` before touching `api/torn_client.py`**. We mix both deliberately: v1 (frozen but functional) for selections where v2 changed shape, v2 everywhere else. Inline `# NB: v1 because ...` comments name each mismatch; the doc lists the exact array-vs-dict / nested-vs-flat / renamed-field breakages we found empirically. Pytest is mocked and will NOT catch shape mismatches — probe live v2 + walk through UI under playwright before flipping any URL.

## Testing notes

- Backend tests use `pytest-asyncio` with `asyncio_mode = "auto"` — all async test functions auto-detected
- `TornClient` is mocked in tests by replacing the `_http` attribute with a mock that returns canned responses
- Frontend has no test suite; `npm run build` (static export) serves as the build verification
