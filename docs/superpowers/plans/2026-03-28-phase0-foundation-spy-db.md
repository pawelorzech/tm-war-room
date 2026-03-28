# Phase 0: Foundation + Spy DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor TM Hub backend into modular architecture and add spy database with stat snapshots.

**Architecture:** Extract monolithic main.py into routers/services/repos pattern. Add background scheduler (APScheduler) for periodic data collection. Build spy database aggregating YATA + TornStats + manual submissions. Collect daily stat snapshots for all members.

**Tech Stack:** FastAPI, SQLite (WAL), APScheduler 4, httpx, pytest

---

### Task 1: Create BaseRepository

**Files:**
- Create: `api/db/__init__.py`
- Create: `api/db/repos/__init__.py`
- Create: `api/db/repos/base.py`
- Test: `tests/test_base_repo.py`

- [ ] **Step 1: Create package structure**

```bash
mkdir -p api/db/repos
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_base_repo.py`:

```python
import pytest
from api.db.repos.base import BaseRepository


@pytest.fixture
def repo(tmp_path):
    return BaseRepository(str(tmp_path / "test.db"))


def test_execute_creates_table_and_queries(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    repo.mutate("INSERT INTO test (id, name) VALUES (?, ?)", (1, "alice"))
    rows = repo.execute("SELECT * FROM test")
    assert len(rows) == 1
    assert rows[0]["id"] == 1
    assert rows[0]["name"] == "alice"


def test_execute_one_returns_single_row(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    repo.mutate("INSERT INTO test (id, name) VALUES (?, ?)", (1, "bob"))
    row = repo.execute_one("SELECT * FROM test WHERE id = ?", (1,))
    assert row is not None
    assert row["name"] == "bob"


def test_execute_one_returns_none_for_no_match(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    row = repo.execute_one("SELECT * FROM test WHERE id = ?", (999,))
    assert row is None


def test_mutate_returns_lastrowid(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)")
    row_id = repo.mutate("INSERT INTO test (name) VALUES (?)", ("carol",))
    assert row_id == 1
    row_id2 = repo.mutate("INSERT INTO test (name) VALUES (?)", ("dave",))
    assert row_id2 == 2


def test_wal_mode_enabled(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY)")
    rows = repo.execute("PRAGMA journal_mode")
    assert rows[0]["journal_mode"] == "wal"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_base_repo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.db.repos'`

- [ ] **Step 4: Write implementation**

Create `api/db/__init__.py`:
```python
```

Create `api/db/repos/__init__.py`:
```python
```

Create `api/db/repos/base.py`:
```python
from __future__ import annotations

import sqlite3


class BaseRepository:
    def __init__(self, db_path: str):
        self._db_path = db_path

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def execute(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._conn() as conn:
            return conn.execute(sql, params).fetchall()

    def execute_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        rows = self.execute(sql, params)
        return rows[0] if rows else None

    def mutate(self, sql: str, params: tuple = ()) -> int:
        with self._conn() as conn:
            cursor = conn.execute(sql, params)
            conn.commit()
            return cursor.lastrowid
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_base_repo.py -v`
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add api/db/ tests/test_base_repo.py
git commit -m "feat: add BaseRepository for DB abstraction layer"
```

---

### Task 2: Create migration runner

**Files:**
- Create: `api/db/migrations/__init__.py`
- Create: `api/db/migrations/runner.py`
- Create: `api/db/migrations/001_member_keys.sql`
- Create: `api/db/migrations/002_admin_roles.sql`
- Create: `api/db/migrations/003_announcements.sql`
- Create: `api/db/migrations/004_request_log.sql`
- Create: `api/db/migrations/005_integration_log.sql`
- Test: `tests/test_migrations.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_migrations.py`:

```python
import os
import sqlite3
import pytest
from api.db.migrations.runner import run_migrations


@pytest.fixture
def migrations_dir(tmp_path):
    mdir = tmp_path / "migrations"
    mdir.mkdir()
    (mdir / "001_create_users.sql").write_text(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);"
    )
    (mdir / "002_create_posts.sql").write_text(
        "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);\n"
        "CREATE INDEX idx_posts_user ON posts(user_id);"
    )
    return str(mdir)


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")


def test_run_migrations_creates_tables(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    conn = sqlite3.connect(db_path)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    table_names = [t[0] for t in tables]
    conn.close()
    assert "users" in table_names
    assert "posts" in table_names
    assert "_migrations" in table_names


def test_run_migrations_records_applied(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    conn = sqlite3.connect(db_path)
    applied = conn.execute("SELECT filename FROM _migrations ORDER BY filename").fetchall()
    conn.close()
    assert [r[0] for r in applied] == ["001_create_users.sql", "002_create_posts.sql"]


def test_run_migrations_idempotent(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    run_migrations(db_path, migrations_dir)  # should not crash
    conn = sqlite3.connect(db_path)
    applied = conn.execute("SELECT filename FROM _migrations ORDER BY filename").fetchall()
    conn.close()
    assert len(applied) == 2


def test_run_migrations_applies_new_only(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    # Add a new migration
    with open(os.path.join(migrations_dir, "003_add_email.sql"), "w") as f:
        f.write("ALTER TABLE users ADD COLUMN email TEXT;")
    run_migrations(db_path, migrations_dir)
    conn = sqlite3.connect(db_path)
    applied = conn.execute("SELECT filename FROM _migrations ORDER BY filename").fetchall()
    cols = conn.execute("PRAGMA table_info(users)").fetchall()
    conn.close()
    assert len(applied) == 3
    assert any(c[1] == "email" for c in cols)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_migrations.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write implementation**

Create `api/db/migrations/__init__.py`:
```python
```

Create `api/db/migrations/runner.py`:
```python
from __future__ import annotations

import logging
import os
import sqlite3

logger = logging.getLogger("tm-hub.migrations")


def run_migrations(db_path: str, migrations_dir: str) -> list[str]:
    """Apply unapplied SQL migration files in filename order. Returns list of newly applied filenames."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    applied = {row[0] for row in conn.execute("SELECT filename FROM _migrations").fetchall()}

    migration_files = sorted(
        f for f in os.listdir(migrations_dir)
        if f.endswith(".sql") and f not in applied
    )

    newly_applied = []
    for filename in migration_files:
        filepath = os.path.join(migrations_dir, filename)
        sql = open(filepath).read()
        try:
            conn.executescript(sql)
            conn.execute("INSERT INTO _migrations (filename) VALUES (?)", (filename,))
            conn.commit()
            logger.info("Applied migration: %s", filename)
            newly_applied.append(filename)
        except Exception as e:
            logger.error("Migration %s failed: %s", filename, e)
            raise

    conn.close()
    return newly_applied
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_migrations.py -v`
Expected: 4 passed

- [ ] **Step 5: Create migration files for existing tables**

Create `api/db/migrations/001_member_keys.sql`:
```sql
CREATE TABLE IF NOT EXISTS member_keys (
    player_id INTEGER PRIMARY KEY,
    player_name TEXT NOT NULL,
    api_key_encrypted BLOB NOT NULL,
    is_faction_key INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Create `api/db/migrations/002_admin_roles.sql`:
```sql
CREATE TABLE IF NOT EXISTS admin_roles (
    player_id INTEGER PRIMARY KEY,
    granted_by INTEGER NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Create `api/db/migrations/003_announcements.sql`:
```sql
CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('alert', 'warning', 'info', 'success')),
    message TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_by INTEGER,
    revoke_reason TEXT
);
```

Create `api/db/migrations/004_request_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    player_id INTEGER,
    method TEXT,
    endpoint TEXT,
    status_code INTEGER,
    response_time_ms REAL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_rl_timestamp ON request_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_rl_player_id ON request_log(player_id);
CREATE INDEX IF NOT EXISTS idx_rl_endpoint ON request_log(endpoint);
```

Create `api/db/migrations/005_integration_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS integration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    service TEXT NOT NULL,
    endpoint TEXT,
    success INTEGER NOT NULL,
    response_time_ms REAL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_il_service ON integration_log(service);
CREATE INDEX IF NOT EXISTS idx_il_timestamp ON integration_log(timestamp);
```

- [ ] **Step 6: Commit**

```bash
git add api/db/migrations/ tests/test_migrations.py
git commit -m "feat: add SQL migration runner with initial migration files"
```

---

### Task 3: Migrate KeyStore → KeyRepository + AnnouncementRepository

**Files:**
- Create: `api/db/repos/keys.py`
- Create: `api/db/repos/announcements.py`
- Modify: `tests/test_db.py` — update imports
- Modify: `tests/test_announcements.py` — update imports
- Keep: `api/db.py` — thin wrapper for backwards compat during transition

- [ ] **Step 1: Create KeyRepository**

Create `api/db/repos/keys.py`:

```python
from __future__ import annotations

from cryptography.fernet import Fernet
from api.db.repos.base import BaseRepository


class KeyRepository(BaseRepository):
    def __init__(self, db_path: str, encryption_key: str):
        super().__init__(db_path)
        self._fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)

    def save_key(self, player_id: int, player_name: str, api_key: str, is_faction_key: bool = False) -> None:
        encrypted = self._fernet.encrypt(api_key.encode())
        conn = self._conn()
        if is_faction_key:
            conn.execute("UPDATE member_keys SET is_faction_key = 0 WHERE is_faction_key = 1")
        conn.execute(
            """INSERT INTO member_keys (player_id, player_name, api_key_encrypted, is_faction_key)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(player_id) DO UPDATE SET
                 player_name = excluded.player_name,
                 api_key_encrypted = excluded.api_key_encrypted,
                 is_faction_key = excluded.is_faction_key""",
            (player_id, player_name, encrypted, int(is_faction_key)),
        )
        conn.commit()
        conn.close()

    def delete_key(self, player_id: int) -> None:
        conn = self._conn()
        conn.execute("DELETE FROM member_keys WHERE player_id = ?", (player_id,))
        conn.commit()
        conn.close()

    def get_all_keys(self) -> list[dict]:
        conn = self._conn()
        rows = conn.execute("SELECT player_id, player_name, api_key_encrypted, is_faction_key FROM member_keys").fetchall()
        conn.close()
        result = []
        for row in rows:
            api_key = self._fernet.decrypt(row["api_key_encrypted"]).decode()
            result.append({
                "player_id": row["player_id"], "player_name": row["player_name"],
                "api_key": api_key, "is_faction_key": bool(row["is_faction_key"]),
            })
        return result

    def get_faction_key(self) -> dict | None:
        conn = self._conn()
        row = conn.execute("SELECT player_id, player_name, api_key_encrypted FROM member_keys WHERE is_faction_key = 1").fetchone()
        conn.close()
        if not row:
            return None
        return {"player_id": row["player_id"], "player_name": row["player_name"], "api_key": self._fernet.decrypt(row["api_key_encrypted"]).decode()}

    def get_keys_metadata(self) -> list[dict]:
        conn = self._conn()
        rows = conn.execute("SELECT player_id, player_name, is_faction_key, created_at FROM member_keys").fetchall()
        conn.close()
        return [{"player_id": r["player_id"], "player_name": r["player_name"], "is_faction_key": bool(r["is_faction_key"]), "created_at": r["created_at"]} for r in rows]

    def get_admins(self) -> list[dict]:
        conn = self._conn()
        rows = conn.execute(
            "SELECT a.player_id, a.granted_by, a.granted_at, k.player_name "
            "FROM admin_roles a LEFT JOIN member_keys k ON a.player_id = k.player_id"
        ).fetchall()
        conn.close()
        return [{"player_id": r[0], "granted_by": r[1], "granted_at": r[2], "player_name": r[3] or "Unknown"} for r in rows]

    def is_admin(self, player_id: int) -> bool:
        row = self.execute_one("SELECT 1 FROM admin_roles WHERE player_id = ?", (player_id,))
        return row is not None

    def promote_admin(self, player_id: int, granted_by: int) -> None:
        conn = self._conn()
        conn.execute("INSERT OR IGNORE INTO admin_roles (player_id, granted_by) VALUES (?, ?)", (player_id, granted_by))
        conn.commit()
        conn.close()

    def demote_admin(self, player_id: int) -> None:
        conn = self._conn()
        conn.execute("DELETE FROM admin_roles WHERE player_id = ?", (player_id,))
        conn.commit()
        conn.close()
```

- [ ] **Step 2: Create AnnouncementRepository**

Create `api/db/repos/announcements.py`:

```python
from __future__ import annotations

from api.db.repos.base import BaseRepository


class AnnouncementRepository(BaseRepository):
    def create_announcement(self, type: str, message: str, created_by: int, expires_at: str | None = None) -> int:
        conn = self._conn()
        cur = conn.execute(
            "INSERT INTO announcements (type, message, created_by, expires_at) VALUES (?, ?, ?, ?)",
            (type, message, created_by, expires_at),
        )
        ann_id = cur.lastrowid
        conn.commit()
        conn.close()
        return ann_id

    def get_active_announcements(self) -> list[dict]:
        conn = self._conn()
        rows = conn.execute(
            "SELECT id, type, message, created_by, created_at, expires_at "
            "FROM announcements "
            "WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now')) "
            "ORDER BY CASE type WHEN 'alert' THEN 0 ELSE 1 END, created_at DESC"
        ).fetchall()
        conn.close()
        return [{"id": r[0], "type": r[1], "message": r[2], "created_by": r[3], "created_at": r[4], "expires_at": r[5]} for r in rows]

    def get_all_announcements(self) -> list[dict]:
        conn = self._conn()
        rows = conn.execute(
            "SELECT id, type, message, created_by, created_at, expires_at, revoked_at, revoked_by, revoke_reason "
            "FROM announcements ORDER BY created_at DESC"
        ).fetchall()
        conn.close()
        return [
            {"id": r[0], "type": r[1], "message": r[2], "created_by": r[3], "created_at": r[4],
             "expires_at": r[5], "revoked_at": r[6], "revoked_by": r[7], "revoke_reason": r[8]}
            for r in rows
        ]

    def revoke_announcement(self, ann_id: int, revoked_by: int, reason: str | None = None) -> bool:
        conn = self._conn()
        cur = conn.execute(
            "UPDATE announcements SET revoked_at = datetime('now'), revoked_by = ?, revoke_reason = ? "
            "WHERE id = ? AND revoked_at IS NULL",
            (revoked_by, reason, ann_id),
        )
        conn.commit()
        changed = cur.rowcount > 0
        conn.close()
        return changed
```

- [ ] **Step 3: Update db.py as thin wrapper**

Replace `api/db.py` contents — `KeyStore` now delegates to `KeyRepository` + `AnnouncementRepository` so existing imports keep working:

```python
from __future__ import annotations

from api.db.repos.keys import KeyRepository
from api.db.repos.announcements import AnnouncementRepository
from api.db.migrations.runner import run_migrations
import os


class KeyStore:
    """Backwards-compatible wrapper. Delegates to KeyRepository + AnnouncementRepository."""

    def __init__(self, db_path: str = "data/keys.db", encryption_key: str = "") -> None:
        migrations_dir = os.path.join(os.path.dirname(__file__), "db", "migrations")
        run_migrations(db_path, migrations_dir)
        self._keys = KeyRepository(db_path, encryption_key)
        self._announcements = AnnouncementRepository(db_path)

    # Key methods
    def save_key(self, **kw): return self._keys.save_key(**kw)
    def delete_key(self, **kw): return self._keys.delete_key(**kw)
    def get_all_keys(self): return self._keys.get_all_keys()
    def get_faction_key(self): return self._keys.get_faction_key()
    def get_keys_metadata(self): return self._keys.get_keys_metadata()
    def get_admins(self): return self._keys.get_admins()
    def is_admin(self, player_id): return self._keys.is_admin(player_id)
    def promote_admin(self, player_id, granted_by): return self._keys.promote_admin(player_id, granted_by)
    def demote_admin(self, player_id): return self._keys.demote_admin(player_id)

    # Announcement methods
    def create_announcement(self, **kw): return self._announcements.create_announcement(**kw)
    def get_active_announcements(self): return self._announcements.get_active_announcements()
    def get_all_announcements(self): return self._announcements.get_all_announcements()
    def revoke_announcement(self, ann_id, revoked_by, reason=None): return self._announcements.revoke_announcement(ann_id, revoked_by, reason)

    # Expose for direct access
    @property
    def _db_path(self):
        return self._keys._db_path
```

- [ ] **Step 4: Run ALL existing tests**

Run: `uv run pytest tests/ -v`
Expected: All 79 tests pass. The `KeyStore` wrapper preserves the exact same interface.

- [ ] **Step 5: Commit**

```bash
git add api/db/repos/keys.py api/db/repos/announcements.py api/db.py
git commit -m "refactor: extract KeyRepository + AnnouncementRepository from KeyStore"
```

---

### Task 4: Migrate AnalyticsStore → AnalyticsRepository

**Files:**
- Create: `api/db/repos/analytics.py`
- Modify: `api/analytics.py` — thin wrapper delegating to repo
- Test: existing `tests/test_analytics.py` must still pass

- [ ] **Step 1: Create AnalyticsRepository**

Create `api/db/repos/analytics.py`:

```python
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from api.db.repos.base import BaseRepository


class AnalyticsRepository(BaseRepository):
    def log_request(self, player_id: int | None, method: str, endpoint: str, status_code: int, response_time_ms: float, error_message: str | None = None) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT INTO request_log (player_id, method, endpoint, status_code, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?, ?)",
            (player_id, method, endpoint, status_code, response_time_ms, error_message),
        )
        conn.commit()
        conn.close()

    def log_integration(self, service: str, endpoint: str, success: bool, response_time_ms: float, error_message: str | None = None) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT INTO integration_log (service, endpoint, success, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?)",
            (service, endpoint, int(success), response_time_ms, error_message),
        )
        conn.commit()
        conn.close()

    def cleanup(self, days: int = 30) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        conn.execute("DELETE FROM request_log WHERE timestamp < ?", (cutoff,))
        conn.execute("DELETE FROM integration_log WHERE timestamp < ?", (cutoff,))
        conn.commit()
        conn.close()

    def get_request_stats(self, days: int = 7) -> dict:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        per_day = conn.execute(
            "SELECT date(timestamp) as day, COUNT(*) as cnt, AVG(response_time_ms) as avg_ms "
            "FROM request_log WHERE timestamp >= ? GROUP BY day ORDER BY day", (cutoff,),
        ).fetchall()
        per_endpoint = conn.execute(
            "SELECT endpoint, COUNT(*) as cnt, AVG(response_time_ms) as avg_ms "
            "FROM request_log WHERE timestamp >= ? GROUP BY endpoint ORDER BY cnt DESC", (cutoff,),
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM request_log WHERE timestamp >= ?", (cutoff,)).fetchone()[0]
        conn.close()
        return {
            "per_day": [{"date": r[0], "count": r[1], "avg_response_ms": round(r[2], 1)} for r in per_day],
            "per_endpoint": [{"endpoint": r[0], "count": r[1], "avg_response_ms": round(r[2], 1)} for r in per_endpoint],
            "total_requests": total,
        }

    def get_user_stats(self, days: int = 7) -> list[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        rows = conn.execute(
            "SELECT player_id, MAX(timestamp) as last_seen, COUNT(*) as cnt "
            "FROM request_log WHERE timestamp >= ? AND player_id IS NOT NULL "
            "GROUP BY player_id ORDER BY last_seen DESC", (cutoff,),
        ).fetchall()
        conn.close()
        return [{"player_id": r[0], "last_seen": r[1], "request_count": r[2]} for r in rows]

    def get_error_stats(self, days: int = 7) -> list[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        rows = conn.execute(
            "SELECT endpoint, status_code, COUNT(*) as cnt, MAX(timestamp) as last_occurred, error_message "
            "FROM request_log WHERE timestamp >= ? AND status_code >= 400 "
            "GROUP BY endpoint, status_code ORDER BY cnt DESC", (cutoff,),
        ).fetchall()
        conn.close()
        return [{"endpoint": r[0], "status_code": r[1], "count": r[2], "last_occurred": r[3], "last_error_message": r[4]} for r in rows]

    def get_integration_status(self) -> dict[str, dict]:
        conn = self._conn()
        services = conn.execute("SELECT DISTINCT service FROM integration_log").fetchall()
        result = {}
        for (service,) in services:
            last_entry = conn.execute(
                "SELECT success, timestamp, error_message FROM integration_log WHERE service = ? ORDER BY id DESC LIMIT 1", (service,),
            ).fetchone()
            last_ok = conn.execute(
                "SELECT timestamp FROM integration_log WHERE service = ? AND success = 1 ORDER BY id DESC LIMIT 1", (service,),
            ).fetchone()
            last_err = conn.execute(
                "SELECT timestamp, error_message FROM integration_log WHERE service = ? AND success = 0 ORDER BY id DESC LIMIT 1", (service,),
            ).fetchone()
            is_error = last_entry and last_entry[0] == 0
            result[service] = {
                "status": "error" if is_error else "ok",
                "last_success": last_ok[0] if last_ok else None,
                "last_error": last_err[1] if last_err else None,
                "last_error_at": last_err[0] if last_err else None,
            }
        conn.close()
        return result
```

- [ ] **Step 2: Update analytics.py as thin wrapper**

Replace `api/analytics.py`:

```python
from __future__ import annotations

from api.db.repos.analytics import AnalyticsRepository
from api.db.migrations.runner import run_migrations
import os


class AnalyticsStore:
    """Backwards-compatible wrapper delegating to AnalyticsRepository."""

    def __init__(self, db_path: str = "data/analytics.db") -> None:
        migrations_dir = os.path.join(os.path.dirname(__file__), "db", "migrations")
        run_migrations(db_path, migrations_dir)
        self._repo = AnalyticsRepository(db_path)

    def log_request(self, *a, **kw): return self._repo.log_request(*a, **kw)
    def log_integration(self, *a, **kw): return self._repo.log_integration(*a, **kw)
    def cleanup(self, *a, **kw): return self._repo.cleanup(*a, **kw)
    def get_request_stats(self, *a, **kw): return self._repo.get_request_stats(*a, **kw)
    def get_user_stats(self, *a, **kw): return self._repo.get_user_stats(*a, **kw)
    def get_error_stats(self, *a, **kw): return self._repo.get_error_stats(*a, **kw)
    def get_integration_status(self): return self._repo.get_integration_status()
```

- [ ] **Step 3: Run ALL tests**

Run: `uv run pytest tests/ -v`
Expected: All 79 tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/db/repos/analytics.py api/analytics.py
git commit -m "refactor: extract AnalyticsRepository from AnalyticsStore"
```

---

### Task 5: Add SpyRepository + migration

**Files:**
- Create: `api/db/migrations/006_spy_reports.sql`
- Create: `api/db/migrations/007_spy_estimates.sql`
- Create: `api/db/repos/spies.py`
- Test: `tests/test_spy_repo.py`

- [ ] **Step 1: Create migration files**

Create `api/db/migrations/006_spy_reports.sql`:
```sql
CREATE TABLE IF NOT EXISTS spy_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    source TEXT NOT NULL,
    strength REAL,
    defense REAL,
    speed REAL,
    dexterity REAL,
    total REAL,
    confidence TEXT,
    reported_at DATETIME NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, source, reported_at)
);
CREATE INDEX IF NOT EXISTS idx_spy_player ON spy_reports(player_id);
CREATE INDEX IF NOT EXISTS idx_spy_fetched ON spy_reports(fetched_at);
```

Create `api/db/migrations/007_spy_estimates.sql`:
```sql
CREATE TABLE IF NOT EXISTS spy_estimates (
    player_id INTEGER PRIMARY KEY,
    player_name TEXT,
    strength REAL,
    defense REAL,
    speed REAL,
    dexterity REAL,
    total REAL,
    confidence TEXT,
    source TEXT,
    reported_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_spy_repo.py`:

```python
import pytest
from datetime import datetime, timedelta
from api.db.repos.spies import SpyRepository
from api.db.migrations.runner import run_migrations
import os


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return SpyRepository(db_path)


def test_upsert_and_get_reports(repo):
    now = datetime.utcnow().isoformat()
    repo.upsert_report(
        player_id=12345, player_name="Target", source="tornstats",
        strength=1e9, defense=8e8, speed=5e8, dexterity=6e8,
        total=2.9e9, confidence="estimate", reported_at=now,
    )
    reports = repo.get_reports(12345)
    assert len(reports) == 1
    assert reports[0]["player_name"] == "Target"
    assert reports[0]["source"] == "tornstats"
    assert reports[0]["strength"] == 1e9


def test_upsert_deduplicates(repo):
    ts = "2026-03-28T12:00:00"
    for _ in range(3):
        repo.upsert_report(
            player_id=100, player_name="Dup", source="yata",
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9,
            total=4e9, confidence="estimate", reported_at=ts,
        )
    reports = repo.get_reports(100)
    assert len(reports) == 1


def test_update_estimate(repo):
    repo.update_estimate(
        player_id=200, player_name="Est", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9,
        total=4e9, confidence="estimate", reported_at="2026-03-28T12:00:00",
    )
    est = repo.get_estimate(200)
    assert est is not None
    assert est["total"] == 4e9
    assert est["source"] == "tornstats"


def test_update_estimate_overwrites(repo):
    repo.update_estimate(
        player_id=200, player_name="Est", source="yata",
        strength=5e8, defense=5e8, speed=5e8, dexterity=5e8,
        total=2e9, confidence="estimate", reported_at="2026-03-27T12:00:00",
    )
    repo.update_estimate(
        player_id=200, player_name="Est", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9,
        total=4e9, confidence="estimate", reported_at="2026-03-28T12:00:00",
    )
    est = repo.get_estimate(200)
    assert est["source"] == "tornstats"
    assert est["total"] == 4e9


def test_get_estimate_returns_none(repo):
    assert repo.get_estimate(99999) is None


def test_get_faction_estimates(repo):
    for pid in [1, 2, 3]:
        repo.update_estimate(
            player_id=pid, player_name=f"P{pid}", source="tornstats",
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9,
            total=4e9, confidence="estimate", reported_at="2026-03-28T12:00:00",
        )
    estimates = repo.get_all_estimates()
    assert len(estimates) == 3
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_spy_repo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.db.repos.spies'`

- [ ] **Step 4: Write implementation**

Create `api/db/repos/spies.py`:

```python
from __future__ import annotations

from api.db.repos.base import BaseRepository


class SpyRepository(BaseRepository):
    def upsert_report(self, player_id: int, player_name: str | None, source: str,
                      strength: float, defense: float, speed: float, dexterity: float,
                      total: float, confidence: str, reported_at: str) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO spy_reports (player_id, player_name, source, strength, defense, speed, dexterity, total, confidence, reported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, source, reported_at) DO UPDATE SET
                player_name = excluded.player_name,
                strength = excluded.strength,
                defense = excluded.defense,
                speed = excluded.speed,
                dexterity = excluded.dexterity,
                total = excluded.total,
                confidence = excluded.confidence,
                fetched_at = CURRENT_TIMESTAMP
        """, (player_id, player_name, source, strength, defense, speed, dexterity, total, confidence, reported_at))
        conn.commit()
        conn.close()

    def get_reports(self, player_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM spy_reports WHERE player_id = ? ORDER BY reported_at DESC", (player_id,)
        )
        return [dict(r) for r in rows]

    def update_estimate(self, player_id: int, player_name: str | None, source: str,
                        strength: float, defense: float, speed: float, dexterity: float,
                        total: float, confidence: str, reported_at: str) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO spy_estimates (player_id, player_name, strength, defense, speed, dexterity, total, confidence, source, reported_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(player_id) DO UPDATE SET
                player_name = excluded.player_name,
                strength = excluded.strength,
                defense = excluded.defense,
                speed = excluded.speed,
                dexterity = excluded.dexterity,
                total = excluded.total,
                confidence = excluded.confidence,
                source = excluded.source,
                reported_at = excluded.reported_at,
                updated_at = CURRENT_TIMESTAMP
        """, (player_id, player_name, strength, defense, speed, dexterity, total, confidence, source, reported_at))
        conn.commit()
        conn.close()

    def get_estimate(self, player_id: int) -> dict | None:
        row = self.execute_one("SELECT * FROM spy_estimates WHERE player_id = ?", (player_id,))
        return dict(row) if row else None

    def get_all_estimates(self) -> list[dict]:
        rows = self.execute("SELECT * FROM spy_estimates ORDER BY total DESC")
        return [dict(r) for r in rows]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_spy_repo.py -v`
Expected: 6 passed

- [ ] **Step 6: Run ALL tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass (79 existing + 6 new)

- [ ] **Step 7: Commit**

```bash
git add api/db/migrations/006_spy_reports.sql api/db/migrations/007_spy_estimates.sql api/db/repos/spies.py tests/test_spy_repo.py
git commit -m "feat: add SpyRepository with spy_reports and spy_estimates tables"
```

---

### Task 6: Add SpyService (best estimate logic)

**Files:**
- Create: `api/services/__init__.py`
- Create: `api/services/spy.py`
- Test: `tests/test_spy_service.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_spy_service.py`:

```python
import os
import pytest
from datetime import datetime, timedelta
from api.db.repos.spies import SpyRepository
from api.db.migrations.runner import run_migrations
from api.services.spy import SpyService


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(path, migrations_dir)
    return path


@pytest.fixture
def service(db_path):
    repo = SpyRepository(db_path)
    return SpyService(repo)


def _days_ago(n: int) -> str:
    return (datetime.utcnow() - timedelta(days=n)).isoformat()


def test_member_submit_wins_over_tornstats(service):
    service.repo.upsert_report(player_id=1, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        confidence="estimate", reported_at=_days_ago(2))
    service.repo.upsert_report(player_id=1, player_name="T", source="member_submit",
        strength=2e9, defense=2e9, speed=2e9, dexterity=2e9, total=8e9,
        confidence="exact", reported_at=_days_ago(1))
    service.refresh_estimate(1)
    est = service.repo.get_estimate(1)
    assert est["source"] == "member_submit"
    assert est["total"] == 8e9
    assert est["confidence"] == "exact"


def test_tornstats_wins_over_yata(service):
    service.repo.upsert_report(player_id=2, player_name="T", source="yata",
        strength=5e8, defense=5e8, speed=5e8, dexterity=5e8, total=2e9,
        confidence="estimate", reported_at=_days_ago(5))
    service.repo.upsert_report(player_id=2, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        confidence="estimate", reported_at=_days_ago(3))
    service.refresh_estimate(2)
    est = service.repo.get_estimate(2)
    assert est["source"] == "tornstats"


def test_stale_report_marked_as_stale(service):
    service.repo.upsert_report(player_id=3, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        confidence="estimate", reported_at=_days_ago(45))
    service.refresh_estimate(3)
    est = service.repo.get_estimate(3)
    assert est["confidence"] == "stale"


def test_no_reports_no_estimate(service):
    service.refresh_estimate(999)
    assert service.repo.get_estimate(999) is None


def test_newer_same_source_wins(service):
    service.repo.upsert_report(player_id=4, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        confidence="estimate", reported_at=_days_ago(10))
    service.repo.upsert_report(player_id=4, player_name="T", source="tornstats",
        strength=2e9, defense=2e9, speed=2e9, dexterity=2e9, total=8e9,
        confidence="estimate", reported_at=_days_ago(2))
    service.refresh_estimate(4)
    est = service.repo.get_estimate(4)
    assert est["total"] == 8e9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_spy_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.services'`

- [ ] **Step 3: Write implementation**

Create `api/services/__init__.py`:
```python
```

Create `api/services/spy.py`:

```python
from __future__ import annotations

from datetime import datetime, timedelta
from api.db.repos.spies import SpyRepository

# Priority: lower = better
SOURCE_PRIORITY = {"member_submit": 0, "tornstats": 1, "yata": 2}
EXACT_MAX_AGE_DAYS = 7
FRESH_MAX_AGE_DAYS = 30


class SpyService:
    def __init__(self, repo: SpyRepository):
        self.repo = repo

    def refresh_estimate(self, player_id: int) -> None:
        """Pick the best spy report for a player and update spy_estimates."""
        reports = self.repo.get_reports(player_id)
        if not reports:
            return

        now = datetime.utcnow()
        best = None
        best_priority = 999
        best_age = 999

        for r in reports:
            reported_at = datetime.fromisoformat(r["reported_at"])
            age_days = (now - reported_at).total_seconds() / 86400
            source = r["source"]
            priority = SOURCE_PRIORITY.get(source, 10)

            # Member submits only count if <7 days old
            if source == "member_submit" and age_days > EXACT_MAX_AGE_DAYS:
                priority = 10  # demote to lowest

            # Compare: lower priority wins, then newer wins
            if priority < best_priority or (priority == best_priority and age_days < best_age):
                best = r
                best_priority = priority
                best_age = age_days

        if best is None:
            return

        reported_at = datetime.fromisoformat(best["reported_at"])
        age_days = (now - reported_at).total_seconds() / 86400

        if best["source"] == "member_submit" and age_days <= EXACT_MAX_AGE_DAYS:
            confidence = "exact"
        elif age_days <= FRESH_MAX_AGE_DAYS:
            confidence = "estimate"
        else:
            confidence = "stale"

        self.repo.update_estimate(
            player_id=player_id,
            player_name=best["player_name"],
            source=best["source"],
            strength=best["strength"],
            defense=best["defense"],
            speed=best["speed"],
            dexterity=best["dexterity"],
            total=best["total"],
            confidence=confidence,
            reported_at=best["reported_at"],
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_spy_service.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add api/services/ tests/test_spy_service.py
git commit -m "feat: add SpyService with best-estimate selection logic"
```

---

### Task 7: Add spy API endpoints

**Files:**
- Create: `api/routers/__init__.py`
- Create: `api/routers/spy.py`
- Modify: `api/main.py` — include spy router
- Test: `tests/test_spy_routes.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_spy_routes.py`:

```python
import os
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport

AUTH_HEADERS = {"X-Player-Id": "123"}


def _mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [{"player_id": 123, "player_name": "Test", "api_key": "fk", "is_faction_key": False}]
    return store


@pytest.fixture
def setup_db(tmp_path):
    """Create a temporary DB with migrations applied."""
    from api.db.migrations.runner import run_migrations
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return db_path


@pytest.mark.asyncio
async def test_get_spy_not_found(setup_db):
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(setup_db)
    spy_service = SpyService(spy_repo)

    with patch("api.main.key_store", _mock_store()), \
         patch("api.routers.spy.spy_service", spy_service):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/99999", headers=AUTH_HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_submit_and_get_spy(setup_db):
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(setup_db)
    spy_service = SpyService(spy_repo)

    with patch("api.main.key_store", _mock_store()), \
         patch("api.routers.spy.spy_service", spy_service):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Submit a spy report
            resp = await ac.post("/api/spy/submit", json={
                "player_id": 456,
                "strength": 1e9, "defense": 8e8, "speed": 5e8, "dexterity": 6e8,
            }, headers=AUTH_HEADERS)
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"

            # Retrieve it
            resp = await ac.get("/api/spy/456", headers=AUTH_HEADERS)
            assert resp.status_code == 200
            data = resp.json()
            assert data["player_id"] == 456
            assert data["strength"] == 1e9
            assert data["confidence"] == "exact"
            assert data["source"] == "member_submit"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_spy_routes.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.routers'`

- [ ] **Step 3: Write implementation**

Create `api/routers/__init__.py`:
```python
```

Create `api/routers/spy.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel

from api.services.spy import SpyService

router = APIRouter(prefix="/api/spy", tags=["spy"])

# Set by main.py during startup
spy_service: SpyService | None = None


def _require_service() -> SpyService:
    if spy_service is None:
        raise HTTPException(status_code=503, detail="Spy service not initialized")
    return spy_service


class SpySubmitBody(BaseModel):
    player_id: int
    strength: float
    defense: float
    speed: float
    dexterity: float


@router.get("/{player_id}")
async def get_spy_estimate(player_id: int, svc: SpyService = Depends(_require_service)):
    est = svc.repo.get_estimate(player_id)
    if not est:
        raise HTTPException(status_code=404, detail="No spy data available for this player")
    reported = datetime.fromisoformat(est["reported_at"])
    age_days = (datetime.utcnow() - reported).days
    return {
        "player_id": est["player_id"],
        "player_name": est["player_name"],
        "strength": est["strength"],
        "defense": est["defense"],
        "speed": est["speed"],
        "dexterity": est["dexterity"],
        "total": est["total"],
        "confidence": est["confidence"],
        "source": est["source"],
        "reported_at": est["reported_at"],
        "age_days": age_days,
    }


@router.post("/submit")
async def submit_spy(body: SpySubmitBody, x_player_id: int = Header(), svc: SpyService = Depends(_require_service)):
    total = body.strength + body.defense + body.speed + body.dexterity
    now = datetime.now(timezone.utc).isoformat()
    svc.repo.upsert_report(
        player_id=body.player_id,
        player_name=None,
        source="member_submit",
        strength=body.strength,
        defense=body.defense,
        speed=body.speed,
        dexterity=body.dexterity,
        total=total,
        confidence="exact",
        reported_at=now,
    )
    svc.refresh_estimate(body.player_id)
    return {"status": "ok", "player_id": body.player_id}
```

- [ ] **Step 4: Register router in main.py**

Add to `api/main.py` imports (after existing imports):

```python
from api.routers.spy import router as spy_router
import api.routers.spy as spy_mod
```

Add to `api/main.py` after `app.include_router(admin_router)`:

```python
app.include_router(spy_router)
```

Add to lifespan function (after `key_store` init, before `admin_mod.init`):

```python
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(db_path="data/keys.db")
    spy_mod.spy_service = SpyService(spy_repo)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_spy_routes.py -v`
Expected: 2 passed

- [ ] **Step 6: Run ALL tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add api/routers/ api/main.py tests/test_spy_routes.py
git commit -m "feat: add spy API endpoints (GET estimate, POST submit)"
```

---

### Task 8: Add StatSnapshot repository + migration

**Files:**
- Create: `api/db/migrations/008_stat_snapshots.sql`
- Create: `api/db/repos/stats.py`
- Test: `tests/test_stats_repo.py`

- [ ] **Step 1: Create migration**

Create `api/db/migrations/008_stat_snapshots.sql`:
```sql
CREATE TABLE IF NOT EXISTS stat_snapshots (
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
CREATE INDEX IF NOT EXISTS idx_snap_player_date ON stat_snapshots(player_id, snapshot_date);
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_stats_repo.py`:

```python
import os
import pytest
from api.db.repos.stats import StatSnapshotRepository
from api.db.migrations.runner import run_migrations


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return StatSnapshotRepository(db_path)


def test_insert_snapshot(repo):
    repo.insert_snapshot(
        player_id=123, snapshot_date="2026-03-28",
        strength=1e9, defense=8e8, speed=5e8, dexterity=6e8, total=2.9e9,
        level=80, xanax_taken=5000, refills=2000, energy_drinks=1000, networth=5e9,
    )
    snaps = repo.get_snapshots(123)
    assert len(snaps) == 1
    assert snaps[0]["strength"] == 1e9
    assert snaps[0]["level"] == 80


def test_insert_duplicate_skips(repo):
    for _ in range(3):
        repo.insert_snapshot(
            player_id=123, snapshot_date="2026-03-28",
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        )
    snaps = repo.get_snapshots(123)
    assert len(snaps) == 1


def test_get_snapshots_ordered(repo):
    for day in ["2026-03-26", "2026-03-28", "2026-03-27"]:
        repo.insert_snapshot(
            player_id=123, snapshot_date=day,
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        )
    snaps = repo.get_snapshots(123)
    dates = [s["snapshot_date"] for s in snaps]
    assert dates == ["2026-03-26", "2026-03-27", "2026-03-28"]


def test_get_latest_snapshot(repo):
    repo.insert_snapshot(player_id=123, snapshot_date="2026-03-27",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9)
    repo.insert_snapshot(player_id=123, snapshot_date="2026-03-28",
        strength=2e9, defense=2e9, speed=2e9, dexterity=2e9, total=8e9)
    latest = repo.get_latest_snapshot(123)
    assert latest["total"] == 8e9
    assert latest["snapshot_date"] == "2026-03-28"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_stats_repo.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 4: Write implementation**

Create `api/db/repos/stats.py`:

```python
from __future__ import annotations

from api.db.repos.base import BaseRepository


class StatSnapshotRepository(BaseRepository):
    def insert_snapshot(self, player_id: int, snapshot_date: str,
                        strength: float, defense: float, speed: float, dexterity: float,
                        total: float, level: int | None = None, xanax_taken: int | None = None,
                        refills: int | None = None, energy_drinks: int | None = None,
                        networth: float | None = None) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO stat_snapshots (player_id, snapshot_date, strength, defense, speed, dexterity, total, level, xanax_taken, refills, energy_drinks, networth)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, snapshot_date) DO NOTHING
        """, (player_id, snapshot_date, strength, defense, speed, dexterity, total, level, xanax_taken, refills, energy_drinks, networth))
        conn.commit()
        conn.close()

    def get_snapshots(self, player_id: int, limit: int = 365) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM stat_snapshots WHERE player_id = ? ORDER BY snapshot_date ASC LIMIT ?",
            (player_id, limit),
        )
        return [dict(r) for r in rows]

    def get_latest_snapshot(self, player_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM stat_snapshots WHERE player_id = ? ORDER BY snapshot_date DESC LIMIT 1",
            (player_id,),
        )
        return dict(row) if row else None
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_stats_repo.py -v`
Expected: 4 passed

- [ ] **Step 6: Run ALL tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add api/db/migrations/008_stat_snapshots.sql api/db/repos/stats.py tests/test_stats_repo.py
git commit -m "feat: add StatSnapshotRepository with daily stat snapshot storage"
```

---

### Task 9: Add APScheduler + background jobs

**Files:**
- Modify: `pyproject.toml` — add apscheduler dependency
- Create: `api/scheduler/__init__.py`
- Create: `api/scheduler/engine.py`
- Create: `api/scheduler/jobs/__init__.py`
- Create: `api/scheduler/jobs/collect_stats.py`
- Create: `api/scheduler/jobs/refresh_spies.py`
- Modify: `api/main.py` — start scheduler in lifespan
- Test: `tests/test_scheduler_jobs.py`

- [ ] **Step 1: Add dependency**

Add `apscheduler>=4.0.0a5` to `pyproject.toml` dependencies:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "httpx>=0.28.0",
    "cryptography>=44.0.0",
    "PyJWT>=2.8.0",
    "apscheduler>=4.0.0a5",
]
```

Run: `uv sync`

- [ ] **Step 2: Write the test for stat collection job**

Create `tests/test_scheduler_jobs.py`:

```python
import os
import pytest
from unittest.mock import AsyncMock, MagicMock
from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository
from api.db.migrations.runner import run_migrations
from api.scheduler.jobs.collect_stats import collect_stat_snapshots
from cryptography.fernet import Fernet


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(path, migrations_dir)
    return path


@pytest.fixture
def key_repo(db_path):
    key = Fernet.generate_key().decode()
    repo = KeyRepository(db_path, key)
    repo.save_key(player_id=123, player_name="Bombel", api_key="test_key_123")
    return repo


@pytest.fixture
def stats_repo(db_path):
    return StatSnapshotRepository(db_path)


@pytest.mark.asyncio
async def test_collect_stat_snapshots(key_repo, stats_repo):
    mock_client = AsyncMock()
    mock_client.fetch_training_data = AsyncMock(return_value={
        "profile": {"name": "Bombel"},
        "battlestats": {"strength": 1e9, "defense": 8e8, "speed": 5e8, "dexterity": 6e8},
        "personalstats": {"xanax_taken": 5000, "refills": 2000, "energy_drinks": 1000, "networth": 5e9},
        "bars": {"happy": {"current": 4000, "maximum": 4525}},
        "gym": {"active_gym": 24},
        "merits": {"brawn": 10, "protection": 10, "sharpness": 5, "evasion": 5},
        "steadfast": {"strength": 20, "defense": 15, "speed": 10, "dexterity": 10},
        "educationCompleted": [],
        "level": 80,
    })

    await collect_stat_snapshots(key_repo, stats_repo, mock_client)

    snaps = stats_repo.get_snapshots(123)
    assert len(snaps) == 1
    assert snaps[0]["strength"] == 1e9
    assert snaps[0]["defense"] == 8e8
    assert snaps[0]["level"] == 80


@pytest.mark.asyncio
async def test_collect_stats_skips_failed_fetch(key_repo, stats_repo):
    mock_client = AsyncMock()
    mock_client.fetch_training_data = AsyncMock(return_value=None)

    await collect_stat_snapshots(key_repo, stats_repo, mock_client)

    snaps = stats_repo.get_snapshots(123)
    assert len(snaps) == 0
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_scheduler_jobs.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 4: Write job implementations**

Create `api/scheduler/__init__.py`:
```python
```

Create `api/scheduler/jobs/__init__.py`:
```python
```

Create `api/scheduler/jobs/collect_stats.py`:

```python
from __future__ import annotations

import logging
from datetime import date

from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository

logger = logging.getLogger("tm-hub.jobs.collect_stats")


async def collect_stat_snapshots(key_repo: KeyRepository, stats_repo: StatSnapshotRepository, torn_client) -> None:
    """Fetch current battlestats for all registered members and store daily snapshot."""
    all_keys = key_repo.get_all_keys()
    today = date.today().isoformat()
    collected = 0

    for entry in all_keys:
        try:
            data = await torn_client.fetch_training_data(entry["api_key"])
            if data is None:
                logger.warning("Failed to fetch stats for player %d", entry["player_id"])
                continue

            bs = data["battlestats"]
            ps = data.get("personalstats", {})
            total = bs["strength"] + bs["defense"] + bs["speed"] + bs["dexterity"]

            stats_repo.insert_snapshot(
                player_id=entry["player_id"],
                snapshot_date=today,
                strength=bs["strength"],
                defense=bs["defense"],
                speed=bs["speed"],
                dexterity=bs["dexterity"],
                total=total,
                level=data.get("level"),
                xanax_taken=ps.get("xanax_taken"),
                refills=ps.get("refills"),
                energy_drinks=ps.get("energy_drinks"),
                networth=ps.get("networth"),
            )
            collected += 1
        except Exception as e:
            logger.error("Error collecting stats for player %d: %s", entry["player_id"], e)

    logger.info("Collected stat snapshots: %d/%d members", collected, len(all_keys))
```

Create `api/scheduler/jobs/refresh_spies.py`:

```python
from __future__ import annotations

import logging
from datetime import datetime, timezone

from api.db.repos.spies import SpyRepository
from api.services.spy import SpyService

logger = logging.getLogger("tm-hub.jobs.refresh_spies")


async def refresh_spy_cache(spy_service: SpyService, torn_client, tornstats_key: str = "") -> None:
    """Fetch spy data from TornStats and upsert into spy_reports."""
    if not tornstats_key:
        logger.debug("No TornStats API key configured, skipping spy refresh")
        return

    # For now, we refresh spy data for the enemy faction from the active war
    try:
        war = await torn_client.fetch_war()
        if not war or not war.factions:
            logger.debug("No active war, skipping spy refresh")
            return

        from api.config import FACTION_ID
        enemy_faction = next((f for f in war.factions if f.id != FACTION_ID), None)
        if not enemy_faction:
            return

        spy_data = await torn_client.fetch_tornstats_spy(enemy_faction.id, tornstats_key)
        if not spy_data:
            return

        now = datetime.now(timezone.utc).isoformat()
        updated_players = []

        for player_id, ps in spy_data.items():
            # TornStats spy data comes as PersonalStats, we need to check if it has battle stats
            # The fetch_tornstats_spy returns PersonalStats which has combat metrics, not battle stats
            # We'll store what we get — this is the foundation for Phase 1 improvements
            spy_service.repo.upsert_report(
                player_id=player_id,
                player_name=None,
                source="tornstats",
                strength=getattr(ps, "strength", 0) or 0,
                defense=getattr(ps, "defense", 0) or 0,
                speed=getattr(ps, "speed", 0) or 0,
                dexterity=getattr(ps, "dexterity", 0) or 0,
                total=getattr(ps, "total", 0) or 0,
                confidence="estimate",
                reported_at=now,
            )
            updated_players.append(player_id)

        for pid in updated_players:
            spy_service.refresh_estimate(pid)

        logger.info("Refreshed spy data for %d players from TornStats", len(updated_players))

    except Exception as e:
        logger.error("Spy refresh failed: %s", e)
```

Create `api/scheduler/engine.py`:

```python
from __future__ import annotations

import logging
from apscheduler import AsyncScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("tm-hub.scheduler")


async def create_scheduler(app_state: dict) -> AsyncScheduler:
    """Create and configure the background scheduler. Caller must start it."""
    scheduler = AsyncScheduler()

    key_repo = app_state["key_repo"]
    stats_repo = app_state["stats_repo"]
    spy_service = app_state["spy_service"]
    torn_client = app_state["torn_client"]
    tornstats_key = app_state.get("tornstats_key", "")

    from api.scheduler.jobs.collect_stats import collect_stat_snapshots
    from api.scheduler.jobs.refresh_spies import refresh_spy_cache

    async def _collect_stats():
        await collect_stat_snapshots(key_repo, stats_repo, torn_client)

    async def _refresh_spies():
        await refresh_spy_cache(spy_service, torn_client, tornstats_key)

    await scheduler.add_schedule(_collect_stats, CronTrigger(hour=4, minute=0), id="collect_stats")
    await scheduler.add_schedule(_refresh_spies, IntervalTrigger(minutes=30), id="refresh_spies")

    logger.info("Scheduler configured: collect_stats (daily 4:00 UTC), refresh_spies (every 30min)")
    return scheduler
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_scheduler_jobs.py -v`
Expected: 2 passed

- [ ] **Step 6: Wire scheduler into main.py lifespan**

Update the lifespan function in `api/main.py`. Add after the spy_service init:

```python
    from api.db.repos.stats import StatSnapshotRepository
    stats_repo = StatSnapshotRepository(db_path="data/keys.db")

    from api.scheduler.engine import create_scheduler
    app_scheduler = await create_scheduler({
        "key_repo": key_store._keys,
        "stats_repo": stats_repo,
        "spy_service": spy_mod.spy_service,
        "torn_client": torn_client,
        "tornstats_key": TORNSTATS_API_KEY,
    })
    await app_scheduler.start_in_background()
```

Add before `yield`:
```python
    logger.info("TM Hub started — scheduler active")
```

Add after `yield` (before close):
```python
    await app_scheduler.stop()
```

- [ ] **Step 7: Run ALL tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add pyproject.toml api/scheduler/ api/main.py tests/test_scheduler_jobs.py
git commit -m "feat: add background scheduler with stat collection and spy refresh jobs"
```

---

### Task 10: Frontend — /spy page

**Files:**
- Create: `frontend/src/app/spy/page.tsx`
- Create: `frontend/src/components/spy/SpySearch.tsx`
- Create: `frontend/src/components/spy/SpyResultCard.tsx`
- Create: `frontend/src/types/spy.ts`
- Modify: `frontend/src/lib/api-client.ts` — add spy endpoints
- Modify: `frontend/src/components/layout/Sidebar.tsx` — add Spy Central link

This task builds the frontend without TDD (frontend is verified by build + visual inspection).

- [ ] **Step 1: Add types**

Create `frontend/src/types/spy.ts`:

```typescript
export interface SpyEstimate {
  player_id: number;
  player_name: string | null;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  confidence: 'exact' | 'estimate' | 'stale';
  source: string;
  reported_at: string;
  age_days: number;
}
```

- [ ] **Step 2: Add API endpoints**

Add to `frontend/src/lib/api-client.ts`:

```typescript
spyEstimate: (playerId: number) => apiFetch<SpyEstimate>(`/api/spy/${playerId}`),
spySubmit: (data: { player_id: number; strength: number; defense: number; speed: number; dexterity: number }) =>
  fetch(`${BASE}/api/spy/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Player-Id": localStorage.getItem("myKeyPlayer") || "" },
    body: JSON.stringify(data),
  }).then(r => r.json()),
```

- [ ] **Step 3: Create SpyResultCard**

Create `frontend/src/components/spy/SpyResultCard.tsx`:

```typescript
'use client';

import type { SpyEstimate } from '@/types/spy';

const CONFIDENCE_STYLES = {
  exact: 'bg-torn-green/20 text-torn-green border-torn-green/40',
  estimate: 'bg-warning/20 text-warning border-warning/40',
  stale: 'bg-danger/20 text-danger border-danger/40',
};

function formatStat(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

export function SpyResultCard({ data }: { data: SpyEstimate }) {
  const stats = [
    { label: 'STR', value: data.strength },
    { label: 'DEF', value: data.defense },
    { label: 'SPD', value: data.speed },
    { label: 'DEX', value: data.dexterity },
  ];

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-text-primary">
            {data.player_name || `Player #${data.player_id}`}
          </h3>
          <p className="text-xs text-text-secondary">
            <a href={`https://www.torn.com/profiles.php?XID=${data.player_id}`}
               target="_blank" className="text-torn-green hover:underline">
              [{data.player_id}]
            </a>
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CONFIDENCE_STYLES[data.confidence]}`}>
          {data.confidence}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-bg-secondary rounded-lg p-3 text-center">
            <p className="text-xs text-text-secondary mb-1">{s.label}</p>
            <p className="text-lg font-bold text-text-primary">{formatStat(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-bg-secondary rounded-lg p-3 text-center">
        <p className="text-xs text-text-secondary mb-1">Total Battle Stats</p>
        <p className="text-2xl font-extrabold text-torn-green">{formatStat(data.total)}</p>
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>Source: {data.source}</span>
        <span>{data.age_days === 0 ? 'Today' : `${data.age_days}d ago`}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create SpySearch**

Create `frontend/src/components/spy/SpySearch.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { SpyEstimate } from '@/types/spy';
import { api } from '@/lib/api-client';
import { SpyResultCard } from './SpyResultCard';

export function SpySearch() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SpyEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    const playerId = parseInt(query.trim(), 10);
    if (isNaN(playerId) || playerId <= 0) {
      setError('Enter a valid player ID');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.spyEstimate(playerId);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No spy data found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Player ID (e.g. 2362436)"
          className="flex-1 bg-bg-card border border-text-secondary/30 rounded-lg px-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-5 py-2.5 bg-torn-green text-white text-sm font-semibold rounded-lg hover:bg-torn-green/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {result && <SpyResultCard data={result} />}
    </div>
  );
}
```

- [ ] **Step 5: Create /spy page**

Create `frontend/src/app/spy/page.tsx`:

```typescript
'use client';

import { SpySearch } from '@/components/spy/SpySearch';

export default function SpyPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Spy Central</h1>
          <p className="text-text-secondary text-sm mt-1">
            Look up battle stat estimates for any player. Data aggregated from TornStats, YATA, and member submissions.
          </p>
        </div>
        <SpySearch />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Enable Spy Central in sidebar**

Update `frontend/src/components/layout/Sidebar.tsx` — change the Spy Central nav item from disabled to enabled:

Replace:
```typescript
      {
        label: "Spy Central",
        href: "/spy",
        icon: "\uD83D\uDD0D",
        disabled: true,
      },
```

With:
```typescript
      {
        label: "Spy Central",
        href: "/spy",
        icon: "\uD83D\uDD0D",
      },
```

- [ ] **Step 7: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/spy/ frontend/src/components/spy/ frontend/src/types/spy.ts frontend/src/lib/api-client.ts frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add Spy Central page with player lookup and stat display"
```

---

### Task 11: Integrate spy data into war room threat scoring

**Files:**
- Modify: `api/main.py` — pass spy_service to enemy endpoint
- Modify: `api/threat.py` — add stat-based threat scoring

- [ ] **Step 1: Add stat-based threat function**

Add to `api/threat.py`:

```python
def compute_stat_threat(enemy_stats: dict, own_stats: dict) -> tuple[int, str]:
    """Compare battle stats directly for accurate threat scoring."""
    enemy_total = enemy_stats.get("total", 0)
    own_total = own_stats.get("total", 0)
    if own_total == 0:
        return 50, "medium"
    ratio = enemy_total / own_total
    if ratio < 0.3:
        return max(5, int(ratio * 30)), "easy"
    elif ratio < 0.7:
        return int(20 + (ratio - 0.3) * 75), "medium"
    elif ratio < 1.2:
        return int(50 + (ratio - 0.7) * 50), "hard"
    else:
        return min(100, int(75 + (ratio - 1.2) * 30)), "avoid"
```

- [ ] **Step 2: Update enemy endpoint in main.py**

In the `/api/enemy` endpoint, after fetching `spy_data` from TornStats, add spy estimate lookup:

```python
    # Check spy estimates for better threat scoring
    spy_estimates = {}
    if spy_mod.spy_service:
        for m in members:
            est = spy_mod.spy_service.repo.get_estimate(m.id)
            if est:
                spy_estimates[m.id] = est
```

Then in the enemy_list loop, before `compute_threat`, add:

```python
        # Prefer spy estimate for stat-based threat if available
        if m.id in spy_estimates and baseline:
            from api.threat import compute_stat_threat
            own_stats_data = None
            if spy_mod.spy_service:
                own_est = spy_mod.spy_service.repo.get_estimate(baseline_pid) if baseline_pid else None
                if own_est:
                    own_stats_data = own_est
            if own_stats_data:
                score, label = compute_stat_threat(spy_estimates[m.id], own_stats_data)
            else:
                score, label = compute_threat(ps, m.level, baseline=baseline)
        else:
            score, label = compute_threat(ps, m.level, baseline=baseline)
```

Add `spy_estimate_total` to the enemy dict:

```python
            "spy_total": spy_estimates[m.id]["total"] if m.id in spy_estimates else None,
```

- [ ] **Step 3: Run ALL tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add api/threat.py api/main.py
git commit -m "feat: integrate spy estimates into war room threat scoring"
```

---

### Task 12: Final verification + build + deploy

- [ ] **Step 1: Run full backend test suite**

Run: `uv run pytest tests/ -v`
Expected: All tests pass (79 existing + new tests)

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Verify new files structure**

Run: `find api/db api/services api/routers api/scheduler -type f | sort`
Expected output:
```
api/db/__init__.py
api/db/migrations/__init__.py
api/db/migrations/001_member_keys.sql
api/db/migrations/002_admin_roles.sql
api/db/migrations/003_announcements.sql
api/db/migrations/004_request_log.sql
api/db/migrations/005_integration_log.sql
api/db/migrations/006_spy_reports.sql
api/db/migrations/007_spy_estimates.sql
api/db/migrations/008_stat_snapshots.sql
api/db/migrations/runner.py
api/db/repos/__init__.py
api/db/repos/analytics.py
api/db/repos/base.py
api/db/repos/keys.py
api/db/repos/announcements.py
api/db/repos/spies.py
api/db/repos/stats.py
api/routers/__init__.py
api/routers/spy.py
api/scheduler/__init__.py
api/scheduler/engine.py
api/scheduler/jobs/__init__.py
api/scheduler/jobs/collect_stats.py
api/scheduler/jobs/refresh_spies.py
api/services/__init__.py
api/services/spy.py
```

- [ ] **Step 4: Push and deploy**

```bash
git push origin master
```

Trigger deploy via Coolify API.
