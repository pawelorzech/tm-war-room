# TM Hub Platform Architecture + Phase 0 Design

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Platform-wide architecture + Phase 0 (Foundation + Spy DB)

## Vision

TM Hub becomes a full Torn.com toolkit for The Masters [TM] — a self-hosted alternative to YATA and TornStats. Single-faction, ~80 members.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Target audience | TM only | Simpler auth, no multi-tenancy |
| Spy data sources | YATA + TornStats + own DB | Aggregate for best accuracy, build own long-term |
| Historical data | Collect from now + import from Torn API | No dependency on YATA/TornStats for history |
| Real-time updates | Adaptive polling (60s → 10s during war) | Torn API has no webhooks, static export stays simple |
| Storage | SQLite now, PostgreSQL later | SQLite handles ~80 members fine; repository pattern enables swap |

## Feature Roadmap

| Phase | Features | Infrastructure Built |
|---|---|---|
| **0 — Foundation + Spy DB** | Spy database, stat snapshots | Repository pattern, scheduler, SQL migrations, router modules |
| **1 — War & Chain** | Chain reports, war reports, target lists | Attack log ingestion, adaptive polling |
| **2 — Player Tools** | Awards tracker, stat growth charts, loot timing, revive tracker | Historical queries, client-side timers |
| **3 — Economy** | Bazaar scanner, stock tracker, travel planner | Market data polling, price history |
| **4 — Training+** | OC planner, company calc upgrade | Leverages existing training infra |

Each phase gets its own spec → plan → implementation cycle.

---

## Platform Architecture

### Backend Structure

```
api/
├── main.py              # FastAPI app, lifespan, middleware (~80 lines)
├── config.py            # env vars
├── auth.py              # JWT + rate limiting
├── torn_client.py       # Torn/YATA/TornStats API client
├── threat.py            # Threat scoring
├── db/
│   ├── engine.py        # Connection factory
│   ├── migrations/      # Sequential SQL migrations
│   │   ├── runner.py    # Auto-apply on startup
│   │   ├── 001_initial_keys.sql
│   │   ├── 002_analytics.sql
│   │   └── ...
│   └── repos/           # Repository pattern
│       ├── base.py      # BaseRepository
│       ├── keys.py      # KeyRepository (from db.py)
│       ├── announcements.py
│       ├── analytics.py
│       ├── spies.py     # SpyRepository
│       └── stats.py     # StatSnapshotRepository
├── services/            # Business logic
│   ├── spy.py           # Aggregate spy data, pick best estimate
│   └── ...
├── routers/             # Thin FastAPI routers
│   ├── auth.py          # /api/me, /api/keys
│   ├── members.py       # /api/overview, /api/members/detail
│   ├── war.py           # /api/enemy
│   ├── training.py      # /api/training/stats
│   ├── announcements.py # /api/announcements
│   ├── spy.py           # /api/spy/*
│   └── admin.py         # /api/admin/*
└── scheduler/
    ├── engine.py        # APScheduler setup
    └── jobs/
        ├── collect_stats.py
        └── refresh_spies.py
```

### Key Patterns

- **Routers are thin** — validate input, call service, return response
- **Services have logic** — data aggregation, calculations, decisions
- **Repositories do DB** — CRUD, queries, abstraction over SQLite/PG
- **Scheduler runs in lifespan** — background jobs as separate modules

### Frontend Structure (unchanged pattern)

New features follow existing convention:
```
frontend/src/
├── app/{feature}/page.tsx
├── components/{feature}/
├── hooks/use{Feature}Data.ts
└── types/{feature}.ts
```

### Repository Pattern

```python
class BaseRepository:
    def __init__(self, db_path: str):
        self._db_path = db_path

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def execute(self, sql: str, params=()) -> list[sqlite3.Row]:
        with self._conn() as conn:
            return conn.execute(sql, params).fetchall()

    def execute_one(self, sql: str, params=()) -> sqlite3.Row | None:
        rows = self.execute(sql, params)
        return rows[0] if rows else None

    def mutate(self, sql: str, params=()) -> int:
        with self._conn() as conn:
            cursor = conn.execute(sql, params)
            conn.commit()
            return cursor.lastrowid
```

PG migration later: new `PgBaseRepository` with `asyncpg`, swap via env var in `db/engine.py`. SQL stays simple enough that 95% works unchanged.

### Migration System

Simple sequential SQL files in `api/db/migrations/`. Runner on startup:

```python
# api/db/migrations/runner.py
# Maintains _migrations(id, filename, applied_at) table
# On startup: applies unapplied migrations in filename order
```

No Alembic dependency. No SQLAlchemy. Plain SQL files.

### Background Scheduler

APScheduler 4 (async, in-process). Starts in FastAPI lifespan.

```python
# Schedules for Phase 0:
# - Daily 4:00 UTC: collect stat snapshots for all members
# - Every 30min: refresh spy cache from YATA + TornStats
# - Every 5min (war active only): ingest attack log
```

Error handling: each job wraps in try/except, logs failures to `integration_log`, continues on next execution. No retry — next scheduled run handles it.

---

## Phase 0 Design: Foundation + Spy DB

### New Database Tables

#### spy_reports

Raw spy data from all sources. Append-only, deduped by unique constraint.

```sql
CREATE TABLE spy_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    source TEXT NOT NULL,          -- 'yata', 'tornstats', 'member_submit'
    strength REAL,
    defense REAL,
    speed REAL,
    dexterity REAL,
    total REAL,
    confidence TEXT,               -- 'exact', 'estimate', 'stale'
    reported_at DATETIME NOT NULL, -- when the spy was done
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, source, reported_at)
);
CREATE INDEX idx_spy_player ON spy_reports(player_id);
CREATE INDEX idx_spy_fetched ON spy_reports(fetched_at);
```

#### spy_estimates

Best estimate per player. Refreshed by SpyService when new reports come in.

```sql
CREATE TABLE spy_estimates (
    player_id INTEGER PRIMARY KEY,
    player_name TEXT,
    strength REAL,
    defense REAL,
    speed REAL,
    dexterity REAL,
    total REAL,
    confidence TEXT,    -- 'exact', 'estimate', 'stale'
    source TEXT,        -- which source won
    reported_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### stat_snapshots

Daily stat snapshots for TM members. One row per member per day.

```sql
CREATE TABLE stat_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    strength REAL NOT NULL,
    defense REAL NOT NULL,
    speed REAL NOT NULL,
    dexterity REAL NOT NULL,
    total REAL NOT NULL,
    level INTEGER,
    xanax_taken INTEGER,
    refills INTEGER,
    energy_drinks INTEGER,
    networth REAL,
    UNIQUE(player_id, snapshot_date)
);
CREATE INDEX idx_snap_player_date ON stat_snapshots(player_id, snapshot_date);
```

### SpyService — Best Estimate Logic

Priority order for picking the best estimate for a player:

1. **Exact spy** (source=member_submit, age <7 days)
2. **TornStats** (age <30 days)
3. **YATA** (age <30 days)
4. **Stale** (age >30 days, any source) — marked confidence='stale'

When multiple reports exist from the same tier, newest wins.

`spy_estimates` table is refreshed whenever new reports are ingested (by scheduler job or manual submit).

### API Endpoints (Phase 0)

```
GET  /api/spy/{player_id}          — Best estimate for one player
GET  /api/spy/faction/{faction_id} — Estimates for all members of a faction
POST /api/spy/submit               — Member submits spy report
```

#### GET /api/spy/{player_id}

Response:
```json
{
  "player_id": 12345,
  "player_name": "Target",
  "strength": 1500000000,
  "defense": 1200000000,
  "speed": 800000000,
  "dexterity": 900000000,
  "total": 4400000000,
  "confidence": "estimate",
  "source": "tornstats",
  "reported_at": "2026-03-25T14:30:00Z",
  "age_days": 3
}
```

#### POST /api/spy/submit

Request:
```json
{
  "player_id": 12345,
  "strength": 1500000000,
  "defense": 1200000000,
  "speed": 800000000,
  "dexterity": 900000000
}
```

Auth: X-Player-Id header (must be registered TM member).

### Scheduler Jobs (Phase 0)

#### refresh_spy_cache — every 30 minutes

1. Call YATA API: `GET /api/v1/faction/members/` — returns spy estimates for players YATA knows about
2. Call TornStats API: `GET /api/v2/{key}/spy/faction/{enemy_faction_id}` — for each enemy faction in active wars
3. Upsert into `spy_reports`
4. Recalculate `spy_estimates` for affected players
5. Rate limits: YATA 10 calls/hour (we use 2/hour), TornStats 100/min (we use ~2/30min)

#### collect_stat_snapshots — daily at 4:00 UTC

1. Get all registered keys from KeyRepository
2. For each: `GET /v1/user/?selections=battlestats,personalstats` using their key
3. Insert into `stat_snapshots` (ON CONFLICT skip — one per day)
4. ~30 calls, rate limited to 10/s, completes in ~3s

### Frontend: /spy Page

New page with:
- **Search bar** — player ID or name lookup
- **Result card** — battle stats with confidence badge (green=exact, yellow=estimate, red=stale), source label, report date
- **No faction browse in Phase 0** — that comes with target lists in Phase 1

### War Room Integration

Existing enemy table gets a new column: **Est. Total** showing `spy_estimates.total` if available. Clicking opens spy detail. Threat scoring enhanced:

1. If spy estimate exists → compare stats directly (much more accurate)
2. If not → fall back to current personalstats-based scoring

### Refactor: main.py Decomposition

| Current location | Target | Content |
|---|---|---|
| `/api/me`, `/api/keys` routes | `routers/auth.py` | Key registration, role check |
| `/api/overview`, `/api/members/detail` | `routers/members.py` | Faction member data |
| `/api/enemy` | `routers/war.py` | Enemy + threat scoring |
| `/api/training/stats` | `routers/training.py` | Training calculator data |
| `/api/announcements` routes | `routers/announcements.py` | Announcement CRUD |
| Middleware (logging, redirect) | `main.py` | Stays |
| Lifespan (init singletons) | `main.py` | Stays + adds scheduler |
| SPA fallback | `main.py` | Stays |

Post-refactor `main.py`: ~80 lines.

### Refactor: db.py → Repositories

| Current | Target |
|---|---|
| `KeyStore.save_key()`, etc. | `KeyRepository(BaseRepository)` in `db/repos/keys.py` |
| `KeyStore.create_announcement()`, etc. | `AnnouncementRepository(BaseRepository)` in `db/repos/announcements.py` |
| `AnalyticsStore.*` | `AnalyticsRepository(BaseRepository)` in `db/repos/analytics.py` |

Same methods, same logic, just inheriting from BaseRepository.

### Implementation Order

1. Create `db/repos/base.py` (BaseRepository)
2. Migrate `db.py` → `db/repos/keys.py` + `db/repos/announcements.py` (fix test imports)
3. Migrate `analytics.py` → `db/repos/analytics.py` (fix test imports)
4. Create `db/migrations/runner.py` + migration files for existing tables
5. Extract routes from `main.py` → `routers/` (fix test imports)
6. Add APScheduler to lifespan
7. Create `db/repos/spies.py` + `spy_reports`/`spy_estimates` tables
8. Create `services/spy.py` (SpyService — best estimate logic)
9. Create `routers/spy.py` (API endpoints)
10. Create scheduler jobs: `refresh_spies.py`, `collect_stats.py`
11. Create `db/repos/stats.py` + `stat_snapshots` table
12. Frontend: `/spy` page + components
13. Integrate spy data into war room threat scoring
14. Tests for all new code

### Success Criteria

- All 79 existing tests pass after refactor
- Spy estimates available for enemy faction members within 30 minutes of first deploy
- Members can submit spy reports via `/spy` page
- War room shows estimated total stats for enemies
- Stat snapshots collecting daily (verified in admin dashboard)
- New tests covering: SpyRepository, SpyService, spy endpoints, scheduler jobs, migration runner
