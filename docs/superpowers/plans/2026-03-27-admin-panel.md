# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a JWT-secured admin panel with API key management, usage analytics, error monitoring, and system health dashboard.

**Architecture:** FastAPI middleware logs all `/api/*` requests to a separate `analytics.db`. A new admin router (`/api/admin/*`) is protected by JWT tokens created after Torn API identity verification. Frontend adds an "Admin" tab (right-aligned, visible to admins only) with three cards: System, API Keys, Usage.

**Tech Stack:** FastAPI, PyJWT, SQLite, vanilla JS/CSS

**Spec:** `docs/superpowers/specs/2026-03-27-admin-panel-design.md`

---

### Task 1: Config & Dependencies

**Files:**
- Modify: `app/config.py`
- Modify: `pyproject.toml`

- [ ] **Step 1: Add config variables**

In `app/config.py`, add after the existing `ENCRYPTION_KEY` block:

```python
import secrets as _secrets

ADMIN_PLAYER_IDS: set[int] = {2206960}  # Bombla

_jwt_secret = os.environ.get("JWT_SECRET", "")
if not _jwt_secret:
    _jwt_secret = _secrets.token_urlsafe(32)
    print("WARNING: No JWT_SECRET set. Generated ephemeral secret. Admin sessions will be lost on restart.")

JWT_SECRET: str = _jwt_secret
APP_VERSION: str = os.environ.get("APP_VERSION", "dev")
```

- [ ] **Step 2: Add PyJWT dependency**

In `pyproject.toml`, add `"PyJWT>=2.8.0"` to the `dependencies` list:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "httpx>=0.28.0",
    "cryptography>=44.0.0",
    "PyJWT>=2.8.0",
]
```

- [ ] **Step 3: Install dependencies**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv sync`
Expected: Resolves and installs PyJWT successfully.

- [ ] **Step 4: Verify import works**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run python -c "import jwt; print(jwt.__version__)"`
Expected: Prints PyJWT version (2.8+).

- [ ] **Step 5: Commit**

```bash
git add app/config.py pyproject.toml uv.lock
git commit -m "chore: add admin config vars and PyJWT dependency"
```

---

### Task 2: Analytics Store — Schema & Write Operations

**Files:**
- Create: `app/analytics.py`
- Create: `tests/test_analytics.py`

- [ ] **Step 1: Write failing tests for AnalyticsStore init and logging**

Create `tests/test_analytics.py`:

```python
import pytest
from app.analytics import AnalyticsStore


@pytest.fixture
def store(tmp_path):
    return AnalyticsStore(db_path=str(tmp_path / "test_analytics.db"))


def test_init_creates_tables(store):
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    conn.close()
    names = {t[0] for t in tables}
    assert "request_log" in names
    assert "integration_log" in names


def test_log_request(store):
    store.log_request(player_id=123, method="GET", endpoint="/api/overview", status_code=200, response_time_ms=45.2)
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    rows = conn.execute("SELECT player_id, method, endpoint, status_code, response_time_ms FROM request_log").fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0] == (123, "GET", "/api/overview", 200, 45.2)


def test_log_request_no_player(store):
    store.log_request(player_id=None, method="POST", endpoint="/api/keys", status_code=200, response_time_ms=100.0)
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    rows = conn.execute("SELECT player_id FROM request_log").fetchall()
    conn.close()
    assert rows[0][0] is None


def test_log_integration(store):
    store.log_integration(service="torn_api", endpoint="/v2/faction/members", success=True, response_time_ms=120.5)
    store.log_integration(service="yata", endpoint="/api/v1/faction/members/", success=False, response_time_ms=8000.0, error_message="timeout")
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    rows = conn.execute("SELECT service, success, error_message FROM integration_log ORDER BY id").fetchall()
    conn.close()
    assert len(rows) == 2
    assert rows[0] == ("torn_api", 1, None)
    assert rows[1] == ("yata", 0, "timeout")


def test_cleanup(store):
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    # Insert old entry (40 days ago)
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now', '-40 days'), 1, 'GET', '/api/overview', 200, 50)")
    # Insert recent entry
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 2, 'GET', '/api/overview', 200, 50)")
    conn.execute("INSERT INTO integration_log (timestamp, service, endpoint, success, response_time_ms) VALUES (datetime('now', '-40 days'), 'torn_api', '/test', 1, 50)")
    conn.commit()
    conn.close()
    store.cleanup(days=30)
    conn = sqlite3.connect(store._db_path)
    req_count = conn.execute("SELECT COUNT(*) FROM request_log").fetchone()[0]
    int_count = conn.execute("SELECT COUNT(*) FROM integration_log").fetchone()[0]
    conn.close()
    assert req_count == 1  # only recent entry survives
    assert int_count == 0  # old entry deleted
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_analytics.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analytics'`

- [ ] **Step 3: Implement AnalyticsStore**

Create `app/analytics.py`:

```python
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta


class AnalyticsStore:
    def __init__(self, db_path: str = "data/analytics.db") -> None:
        self._db_path = db_path
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def _init_db(self) -> None:
        conn = self._conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS request_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                player_id INTEGER,
                method TEXT,
                endpoint TEXT,
                status_code INTEGER,
                response_time_ms REAL,
                error_message TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rl_timestamp ON request_log(timestamp)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rl_player_id ON request_log(player_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rl_endpoint ON request_log(endpoint)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS integration_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                service TEXT NOT NULL,
                endpoint TEXT,
                success INTEGER NOT NULL,
                response_time_ms REAL,
                error_message TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_il_service ON integration_log(service)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_il_timestamp ON integration_log(timestamp)")
        conn.commit()
        conn.close()

    def log_request(
        self,
        player_id: int | None,
        method: str,
        endpoint: str,
        status_code: int,
        response_time_ms: float,
        error_message: str | None = None,
    ) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT INTO request_log (player_id, method, endpoint, status_code, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?, ?)",
            (player_id, method, endpoint, status_code, response_time_ms, error_message),
        )
        conn.commit()
        conn.close()

    def log_integration(
        self,
        service: str,
        endpoint: str,
        success: bool,
        response_time_ms: float,
        error_message: str | None = None,
    ) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT INTO integration_log (service, endpoint, success, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?)",
            (service, endpoint, int(success), response_time_ms, error_message),
        )
        conn.commit()
        conn.close()

    def cleanup(self, days: int = 30) -> None:
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        conn.execute("DELETE FROM request_log WHERE timestamp < ?", (cutoff,))
        conn.execute("DELETE FROM integration_log WHERE timestamp < ?", (cutoff,))
        conn.commit()
        conn.close()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_analytics.py -v`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/analytics.py tests/test_analytics.py
git commit -m "feat: add AnalyticsStore with request/integration logging and cleanup"
```

---

### Task 3: Analytics Store — Query Functions

**Files:**
- Modify: `app/analytics.py`
- Modify: `tests/test_analytics.py`

- [ ] **Step 1: Write failing tests for query functions**

Append to `tests/test_analytics.py`:

```python
def _seed_requests(store):
    """Insert sample data for query tests."""
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 100, 'GET', '/api/overview', 200, 40)")
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 100, 'GET', '/api/overview', 200, 60)")
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 200, 'GET', '/api/enemy', 200, 100)")
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms, error_message) VALUES (datetime('now'), 200, 'GET', '/api/enemy', 502, 5000, 'TornStats timeout')")
    conn.commit()
    conn.close()


def test_get_request_stats(store):
    _seed_requests(store)
    stats = store.get_request_stats(days=7)
    assert stats["total_requests"] == 4
    assert len(stats["per_day"]) == 1
    assert len(stats["per_endpoint"]) == 2


def test_get_user_stats(store):
    _seed_requests(store)
    users = store.get_user_stats(days=7)
    assert len(users) == 2
    pids = {u["player_id"] for u in users}
    assert pids == {100, 200}
    user100 = next(u for u in users if u["player_id"] == 100)
    assert user100["request_count"] == 2


def test_get_error_stats(store):
    _seed_requests(store)
    errors = store.get_error_stats(days=7)
    assert len(errors) == 1
    assert errors[0]["endpoint"] == "/api/enemy"
    assert errors[0]["status_code"] == 502
    assert errors[0]["count"] == 1
    assert errors[0]["last_error_message"] == "TornStats timeout"


def test_get_integration_status(store):
    store.log_integration("torn_api", "/v2/faction/members", True, 120.0)
    store.log_integration("yata", "/api/v1/faction/members/", False, 8000.0, "timeout")
    store.log_integration("yata", "/api/v1/faction/members/", True, 200.0)
    status = store.get_integration_status()
    assert status["torn_api"]["status"] == "ok"
    assert status["yata"]["status"] == "ok"  # last call was success


def test_get_integration_status_error(store):
    store.log_integration("tornstats", "/api/v2/spy", True, 300.0)
    store.log_integration("tornstats", "/api/v2/spy", False, 5000.0, "500 Internal Server Error")
    status = store.get_integration_status()
    assert status["tornstats"]["status"] == "error"
    assert status["tornstats"]["last_error"] == "500 Internal Server Error"
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_analytics.py::test_get_request_stats -v`
Expected: FAIL — `AttributeError: 'AnalyticsStore' object has no attribute 'get_request_stats'`

- [ ] **Step 3: Implement query functions**

Add these methods to `AnalyticsStore` in `app/analytics.py`:

```python
    def get_request_stats(self, days: int = 7) -> dict:
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        per_day = conn.execute(
            "SELECT date(timestamp) as day, COUNT(*) as cnt, AVG(response_time_ms) as avg_ms "
            "FROM request_log WHERE timestamp >= ? GROUP BY day ORDER BY day",
            (cutoff,),
        ).fetchall()
        per_endpoint = conn.execute(
            "SELECT endpoint, COUNT(*) as cnt, AVG(response_time_ms) as avg_ms "
            "FROM request_log WHERE timestamp >= ? GROUP BY endpoint ORDER BY cnt DESC",
            (cutoff,),
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM request_log WHERE timestamp >= ?", (cutoff,)
        ).fetchone()[0]
        conn.close()
        return {
            "per_day": [{"date": r[0], "count": r[1], "avg_response_ms": round(r[2], 1)} for r in per_day],
            "per_endpoint": [{"endpoint": r[0], "count": r[1], "avg_response_ms": round(r[2], 1)} for r in per_endpoint],
            "total_requests": total,
        }

    def get_user_stats(self, days: int = 7) -> list[dict]:
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        rows = conn.execute(
            "SELECT player_id, MAX(timestamp) as last_seen, COUNT(*) as cnt "
            "FROM request_log WHERE timestamp >= ? AND player_id IS NOT NULL "
            "GROUP BY player_id ORDER BY last_seen DESC",
            (cutoff,),
        ).fetchall()
        conn.close()
        return [{"player_id": r[0], "last_seen": r[1], "request_count": r[2]} for r in rows]

    def get_error_stats(self, days: int = 7) -> list[dict]:
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        rows = conn.execute(
            "SELECT endpoint, status_code, COUNT(*) as cnt, MAX(timestamp) as last_occurred, error_message "
            "FROM request_log WHERE timestamp >= ? AND status_code >= 400 "
            "GROUP BY endpoint, status_code ORDER BY cnt DESC",
            (cutoff,),
        ).fetchall()
        conn.close()
        return [
            {"endpoint": r[0], "status_code": r[1], "count": r[2], "last_occurred": r[3], "last_error_message": r[4]}
            for r in rows
        ]

    def get_integration_status(self) -> dict[str, dict]:
        conn = self._conn()
        services = conn.execute("SELECT DISTINCT service FROM integration_log").fetchall()
        result = {}
        for (service,) in services:
            last_ok = conn.execute(
                "SELECT timestamp FROM integration_log WHERE service = ? AND success = 1 ORDER BY timestamp DESC LIMIT 1",
                (service,),
            ).fetchone()
            last_err = conn.execute(
                "SELECT timestamp, error_message FROM integration_log WHERE service = ? AND success = 0 ORDER BY timestamp DESC LIMIT 1",
                (service,),
            ).fetchone()
            is_error = last_err and (not last_ok or last_err[0] > last_ok[0])
            result[service] = {
                "status": "error" if is_error else "ok",
                "last_success": last_ok[0] if last_ok else None,
                "last_error": last_err[1] if last_err else None,
                "last_error_at": last_err[0] if last_err else None,
            }
        conn.close()
        return result
```

- [ ] **Step 4: Run all analytics tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_analytics.py -v`
Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/analytics.py tests/test_analytics.py
git commit -m "feat: add analytics query functions (request stats, users, errors, integrations)"
```

---

### Task 4: Auth Module — JWT & Rate Limiting

**Files:**
- Create: `app/auth.py`
- Create: `tests/test_auth.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_auth.py`:

```python
import time
import pytest
from app.auth import create_jwt, decode_jwt, RateLimiter


def test_create_and_decode_jwt():
    token = create_jwt(player_id=2206960, player_name="Bombla", secret="test-secret")
    payload = decode_jwt(token, "test-secret")
    assert payload is not None
    assert payload["sub"] == 2206960
    assert payload["name"] == "Bombla"
    assert "iat" in payload
    assert "exp" in payload


def test_decode_expired_jwt():
    token = create_jwt(player_id=1, player_name="X", secret="s", expires_hours=0)
    # Token expires immediately (exp == iat)
    time.sleep(0.1)
    payload = decode_jwt(token, "s")
    assert payload is None


def test_decode_wrong_secret():
    token = create_jwt(player_id=1, player_name="X", secret="right")
    payload = decode_jwt(token, "wrong")
    assert payload is None


def test_decode_garbage():
    payload = decode_jwt("not.a.token", "secret")
    assert payload is None


def test_rate_limiter_allows_within_limit():
    rl = RateLimiter()
    for _ in range(5):
        assert rl.check("test-key", max_requests=5, window_seconds=60) is True


def test_rate_limiter_blocks_over_limit():
    rl = RateLimiter()
    for _ in range(5):
        rl.check("test-key", max_requests=5, window_seconds=60)
    assert rl.check("test-key", max_requests=5, window_seconds=60) is False


def test_rate_limiter_separate_keys():
    rl = RateLimiter()
    for _ in range(5):
        rl.check("key-a", max_requests=5, window_seconds=60)
    assert rl.check("key-a", max_requests=5, window_seconds=60) is False
    assert rl.check("key-b", max_requests=5, window_seconds=60) is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.auth'`

- [ ] **Step 3: Implement auth module**

Create `app/auth.py`:

```python
from __future__ import annotations

import time

import jwt


def create_jwt(player_id: int, player_name: str, secret: str, expires_hours: int = 24) -> str:
    now = int(time.time())
    payload = {
        "sub": player_id,
        "name": player_name,
        "iat": now,
        "exp": now + expires_hours * 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_jwt(token: str, secret: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None


class RateLimiter:
    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = {}

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        entries = self._requests.get(key, [])
        entries = [t for t in entries if t > cutoff]
        if len(entries) >= max_requests:
            self._requests[key] = entries
            return False
        entries.append(now)
        self._requests[key] = entries
        return True


rate_limiter = RateLimiter()
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_auth.py -v`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/auth.py tests/test_auth.py
git commit -m "feat: add auth module with JWT creation/validation and rate limiter"
```

---

### Task 5: KeyStore Metadata Method

**Files:**
- Modify: `app/db.py`
- Modify: `tests/test_db.py`

The admin panel needs key metadata (player_id, player_name, is_faction_key, created_at) without decrypting the actual API key. The existing `get_all_keys()` decrypts every key which is unnecessary and expensive for the admin listing.

- [ ] **Step 1: Write failing test**

Append to `tests/test_db.py`:

```python
def test_get_keys_metadata(store):
    store.save_key(player_id=123, player_name="Player1", api_key="key1")
    store.save_key(player_id=456, player_name="Player2", api_key="key2", is_faction_key=True)
    meta = store.get_keys_metadata()
    assert len(meta) == 2
    p1 = next(m for m in meta if m["player_id"] == 123)
    assert p1["player_name"] == "Player1"
    assert p1["is_faction_key"] is False
    assert "created_at" in p1
    assert "api_key" not in p1  # no decrypted key
    p2 = next(m for m in meta if m["player_id"] == 456)
    assert p2["is_faction_key"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_db.py::test_get_keys_metadata -v`
Expected: FAIL — `AttributeError: 'KeyStore' object has no attribute 'get_keys_metadata'`

- [ ] **Step 3: Implement get_keys_metadata**

Add to `app/db.py` after the `get_faction_key` method:

```python
    def get_keys_metadata(self) -> list[dict]:
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute(
            "SELECT player_id, player_name, is_faction_key, created_at FROM member_keys"
        ).fetchall()
        conn.close()
        return [
            {"player_id": r[0], "player_name": r[1], "is_faction_key": bool(r[2]), "created_at": r[3]}
            for r in rows
        ]
```

- [ ] **Step 4: Run test**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_db.py -v`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db.py tests/test_db.py
git commit -m "feat: add get_keys_metadata() to KeyStore for admin panel"
```

---

### Task 6: Admin Router — Session & Key Endpoints

**Files:**
- Create: `app/admin.py`
- Create: `tests/test_admin.py`

- [ ] **Step 1: Write failing tests for session creation and key management**

Create `tests/test_admin.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.auth import create_jwt


ADMIN_ID = 2206960
NON_ADMIN_ID = 999


@pytest.fixture
def mock_client():
    client = AsyncMock()
    validate_resp = AsyncMock()
    validate_resp.json.return_value = {"player_id": ADMIN_ID, "name": "Bombla", "faction": {"faction_id": 11559}}
    validate_resp.raise_for_status = lambda: None
    client._http = AsyncMock()
    client._http.get = AsyncMock(return_value=validate_resp)
    client._cache = {"members": (1000000000, []), "war": (1000000000, None)}
    return client


@pytest.fixture
def mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [
        {"player_id": ADMIN_ID, "player_name": "Bombla", "api_key": "admin_key", "is_faction_key": True},
        {"player_id": NON_ADMIN_ID, "player_name": "Member1", "api_key": "member_key", "is_faction_key": False},
    ]
    store.get_keys_metadata.return_value = [
        {"player_id": ADMIN_ID, "player_name": "Bombla", "is_faction_key": True, "created_at": "2026-03-27 12:00:00"},
        {"player_id": NON_ADMIN_ID, "player_name": "Member1", "is_faction_key": False, "created_at": "2026-03-27 13:00:00"},
    ]
    store.delete_key = MagicMock()
    store.get_faction_key.return_value = {"player_id": ADMIN_ID, "player_name": "Bombla", "api_key": "admin_key"}
    return store


@pytest.fixture
def mock_analytics():
    return MagicMock()


def _admin_token(secret="test-jwt-secret"):
    return create_jwt(player_id=ADMIN_ID, player_name="Bombla", secret=secret)


def _setup_app(mock_client, mock_store, mock_analytics):
    """Patch all globals needed by main.py and admin.py."""
    import app.admin as admin_mod
    return (
        patch("app.main.torn_client", mock_client),
        patch("app.main.key_store", mock_store),
        patch("app.main.analytics_store", mock_analytics),
        patch.object(admin_mod, "_key_store", mock_store),
        patch.object(admin_mod, "_analytics_store", mock_analytics),
        patch.object(admin_mod, "_torn_client", mock_client),
        patch.object(admin_mod, "_app_start_time", 1711540800.0),
        patch("app.config.JWT_SECRET", "test-jwt-secret"),
        patch("app.admin.JWT_SECRET", "test-jwt-secret"),
    )


@pytest.mark.asyncio
async def test_create_session_success(mock_client, mock_store, mock_analytics):
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/admin/session", headers={"X-Player-Id": str(ADMIN_ID)})
    assert resp.status_code == 200
    assert "token" in resp.json()


@pytest.mark.asyncio
async def test_create_session_non_admin(mock_client, mock_store, mock_analytics):
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/admin/session", headers={"X-Player-Id": str(NON_ADMIN_ID)})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_keys_list(mock_client, mock_store, mock_analytics):
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    token = _admin_token()
    # Mock fetch_members to return 2 members for total count
    from app.models import FactionMember, LastAction, MemberStatus
    mock_client.fetch_members = AsyncMock(return_value=[
        FactionMember(id=ADMIN_ID, name="Bombla", level=50, days_in_faction=100,
                      last_action=LastAction(status="Online", timestamp=1711540800, relative="1m"),
                      status=MemberStatus(description="Okay", state="Okay", color="green"), position="Leader"),
        FactionMember(id=NON_ADMIN_ID, name="Member1", level=30, days_in_faction=50,
                      last_action=LastAction(status="Online", timestamp=1711540800, relative="2m"),
                      status=MemberStatus(description="Okay", state="Okay", color="green"), position="Team 1"),
    ])
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/keys", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["registered_count"] == 2
    assert data["total_faction_members"] == 2
    assert len(data["keys"]) == 2
    assert "api_key" not in data["keys"][0]  # never expose actual key


@pytest.mark.asyncio
async def test_admin_delete_key(mock_client, mock_store, mock_analytics):
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    token = _admin_token()
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(f"/api/admin/keys/{NON_ADMIN_ID}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    mock_store.delete_key.assert_called_once_with(player_id=NON_ADMIN_ID)


@pytest.mark.asyncio
async def test_admin_cannot_delete_own_key(mock_client, mock_store, mock_analytics):
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    token = _admin_token()
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(f"/api/admin/keys/{ADMIN_ID}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_endpoint_no_token(mock_client, mock_store, mock_analytics):
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/keys")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_admin.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.admin'`

- [ ] **Step 3: Implement admin router**

Create `app/admin.py`:

```python
from __future__ import annotations

import inspect
import time

from fastapi import APIRouter, HTTPException, Header, Query, Request, Depends

from app.config import ADMIN_PLAYER_IDS, JWT_SECRET, APP_VERSION
from app.auth import create_jwt, decode_jwt, rate_limiter

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Set by main.py during startup
_key_store = None
_analytics_store = None
_torn_client = None
_app_start_time: float | None = None


def init(key_store, analytics_store, torn_client, app_start_time: float) -> None:
    global _key_store, _analytics_store, _torn_client, _app_start_time
    _key_store = key_store
    _analytics_store = analytics_store
    _torn_client = torn_client
    _app_start_time = app_start_time


async def require_admin(request: Request) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization")
    token = auth_header[7:]
    payload = decode_jwt(token, JWT_SECRET)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload["sub"] not in ADMIN_PLAYER_IDS:
        raise HTTPException(status_code=403, detail="Not an admin")
    if not rate_limiter.check(f"admin:{payload['sub']}", max_requests=60):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    return payload


@router.post("/session")
async def create_session(x_player_id: int = Header()):
    if not rate_limiter.check(f"session:{x_player_id}", max_requests=5):
        raise HTTPException(status_code=429, detail="Too many attempts, try again later")
    if x_player_id not in ADMIN_PLAYER_IDS:
        raise HTTPException(status_code=403, detail="Not an admin")
    all_keys = _key_store.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    if not user_key:
        raise HTTPException(status_code=401, detail="No API key registered")
    # Verify identity via Torn API
    resp = await _torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "profile", "key": user_key["api_key"]},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw or raw.get("player_id") != x_player_id:
        raise HTTPException(status_code=401, detail="API key verification failed")
    token = create_jwt(x_player_id, user_key["player_name"], JWT_SECRET)
    return {"token": token}


@router.get("/keys")
async def admin_list_keys(admin: dict = Depends(require_admin)):
    keys_meta = _key_store.get_keys_metadata()
    members = await _torn_client.fetch_members()
    return {
        "keys": keys_meta,
        "registered_count": len(keys_meta),
        "total_faction_members": len(members),
    }


@router.delete("/keys/{player_id}")
async def admin_delete_key(player_id: int, admin: dict = Depends(require_admin)):
    if player_id == admin["sub"]:
        raise HTTPException(status_code=403, detail="Cannot delete your own key via admin panel")
    _key_store.delete_key(player_id=player_id)
    return {"status": "ok", "deleted_player_id": player_id, "deleted_by": admin["sub"]}
```

- [ ] **Step 4: Wire admin router into main.py (minimal — just include_router)**

In `app/main.py`, add these changes:

After the existing imports, add:

```python
from app.admin import router as admin_router
import app.admin as admin_mod
```

After `app = FastAPI(...)`, add:

```python
app.include_router(admin_router)
```

Add `analytics_store: ... | None = None` as a module-level global alongside `torn_client` and `key_store`:

```python
analytics_store: ... | None = None
```

In the lifespan, after `key_store = KeyStore(...)`, add:

```python
import time as _time
app_start_time = _time.time()
admin_mod.init(key_store, None, torn_client, app_start_time)
```

(Analytics store will be wired in Task 7. For now, pass `None` so tests can run.)

- [ ] **Step 5: Run tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_admin.py -v`
Expected: All 6 tests PASS.

- [ ] **Step 6: Run all existing tests to check nothing is broken**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest -v`
Expected: All tests PASS (existing + new).

- [ ] **Step 7: Commit**

```bash
git add app/admin.py tests/test_admin.py app/main.py
git commit -m "feat: add admin router with session creation and key management endpoints"
```

---

### Task 7: Admin Router — Stats & System Endpoints

**Files:**
- Modify: `app/admin.py`
- Modify: `tests/test_admin.py`

- [ ] **Step 1: Write failing tests for stats and system endpoints**

Append to `tests/test_admin.py`:

```python
@pytest.mark.asyncio
async def test_admin_request_stats(mock_client, mock_store, mock_analytics):
    mock_analytics.get_request_stats.return_value = {
        "per_day": [{"date": "2026-03-27", "count": 100, "avg_response_ms": 45.0}],
        "per_endpoint": [{"endpoint": "/api/overview", "count": 80, "avg_response_ms": 50.0}],
        "total_requests": 100,
    }
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    token = _admin_token()
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/stats/requests?days=7", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_requests"] == 100
    assert len(data["per_day"]) == 1


@pytest.mark.asyncio
async def test_admin_user_stats(mock_client, mock_store, mock_analytics):
    mock_analytics.get_user_stats.return_value = [
        {"player_id": ADMIN_ID, "last_seen": "2026-03-27T15:30:00", "request_count": 50},
    ]
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    token = _admin_token()
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/stats/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["users"]) == 1
    assert data["users"][0]["player_name"] == "Bombla"


@pytest.mark.asyncio
async def test_admin_error_stats(mock_client, mock_store, mock_analytics):
    mock_analytics.get_error_stats.return_value = [
        {"endpoint": "/api/enemy", "status_code": 502, "count": 3, "last_occurred": "2026-03-27T14:00:00", "last_error_message": "timeout"},
    ]
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    token = _admin_token()
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/stats/errors", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["errors"]) == 1
    assert data["errors"][0]["status_code"] == 502


@pytest.mark.asyncio
async def test_admin_system(mock_client, mock_store, mock_analytics):
    mock_analytics.get_integration_status.return_value = {
        "torn_api": {"status": "ok", "last_success": "2026-03-27T15:00:00", "last_error": None, "last_error_at": None},
    }
    patches = _setup_app(mock_client, mock_store, mock_analytics)
    token = _admin_token()
    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/system", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "uptime_seconds" in data
    assert "version" in data
    assert "cache" in data
    assert "integrations" in data
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_admin.py::test_admin_request_stats -v`
Expected: FAIL — `404 Not Found` (endpoint doesn't exist yet)

- [ ] **Step 3: Implement stats and system endpoints**

Add to `app/admin.py`:

```python
@router.get("/stats/requests")
async def admin_request_stats(days: int = Query(default=7, ge=1, le=30), admin: dict = Depends(require_admin)):
    return _analytics_store.get_request_stats(days=days)


@router.get("/stats/users")
async def admin_user_stats(days: int = Query(default=7, ge=1, le=30), admin: dict = Depends(require_admin)):
    raw_users = _analytics_store.get_user_stats(days=days)
    # Resolve player_id -> player_name from key store
    keys_meta = _key_store.get_keys_metadata()
    name_map = {k["player_id"]: k["player_name"] for k in keys_meta}
    for u in raw_users:
        u["player_name"] = name_map.get(u["player_id"], f"Unknown ({u['player_id']})")
    return {"users": raw_users}


@router.get("/stats/errors")
async def admin_error_stats(days: int = Query(default=7, ge=1, le=30), admin: dict = Depends(require_admin)):
    return {"errors": _analytics_store.get_error_stats(days=days)}


@router.get("/system")
async def admin_system(admin: dict = Depends(require_admin)):
    uptime = time.time() - _app_start_time if _app_start_time else 0
    cache_entries = len(_torn_client._cache) if _torn_client else 0
    cache_times = [ts for ts, _ in _torn_client._cache.values()] if _torn_client and _torn_client._cache else []
    last_refresh = max(cache_times) if cache_times else None

    integrations = _analytics_store.get_integration_status() if _analytics_store else {}
    # Ensure all three services appear even if no logs yet
    for svc in ("torn_api", "tornstats", "yata"):
        if svc not in integrations:
            integrations[svc] = {"status": "unknown", "last_success": None, "last_error": None, "last_error_at": None}

    return {
        "uptime_seconds": int(uptime),
        "version": APP_VERSION,
        "cache": {
            "entries": cache_entries,
            "last_refresh": last_refresh,
        },
        "integrations": integrations,
    }
```

- [ ] **Step 4: Run all admin tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_admin.py -v`
Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin.py tests/test_admin.py
git commit -m "feat: add admin stats/requests, stats/users, stats/errors, and system endpoints"
```

---

### Task 8: Main.py Integration — Middleware, /api/me, Analytics Startup

**Files:**
- Modify: `app/main.py`
- Modify: `tests/test_routes.py`

- [ ] **Step 1: Write failing test for /api/me endpoint**

Append to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_me_admin(mock_client, mock_store):
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store), \
         patch("app.config.ADMIN_PLAYER_IDS", {123}):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/me", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_id"] == 123
    assert data["is_admin"] is True


@pytest.mark.asyncio
async def test_me_non_admin(mock_client, mock_store):
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store), \
         patch("app.config.ADMIN_PLAYER_IDS", {9999}):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/me", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_id"] == 123
    assert data["is_admin"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_routes.py::test_me_admin -v`
Expected: FAIL — `404 Not Found`

- [ ] **Step 3: Implement /api/me and full main.py integration**

Update `app/main.py`:

Add imports at top:

```python
from app.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY, ADMIN_PLAYER_IDS
from app.analytics import AnalyticsStore
import app.admin as admin_mod
from app.admin import router as admin_router
```

Add module-level global:

```python
analytics_store: AnalyticsStore | None = None
```

Update the `lifespan` function to initialize analytics and admin:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    global torn_client, key_store, analytics_store
    os.makedirs("data", exist_ok=True)
    torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL)
    key_store = KeyStore(db_path="data/keys.db", encryption_key=ENCRYPTION_KEY)
    analytics_store = AnalyticsStore(db_path="data/analytics.db")
    analytics_store.cleanup(days=30)
    admin_mod.init(key_store, analytics_store, torn_client, time.time())
    yield
    await torn_client.close()
```

Register admin router after `app = FastAPI(...)`:

```python
app.include_router(admin_router)
```

Add request logging middleware after the `app` creation:

```python
from fastapi import Request

@app.middleware("http")
async def log_requests(request: Request, call_next):
    if analytics_store is None or not request.url.path.startswith("/api/"):
        return await call_next(request)
    start = time.time()
    response = await call_next(request)
    elapsed_ms = (time.time() - start) * 1000
    player_id_raw = request.headers.get("x-player-id")
    pid = int(player_id_raw) if player_id_raw and player_id_raw.isdigit() else None
    try:
        analytics_store.log_request(pid, request.method, request.url.path, response.status_code, elapsed_ms)
    except Exception:
        pass
    return response
```

Add the `/api/me` endpoint:

```python
@app.get("/api/me")
async def me(x_player_id: int = Header()):
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")
    return {
        "player_id": x_player_id,
        "is_admin": x_player_id in ADMIN_PLAYER_IDS,
    }
```

- [ ] **Step 4: Run all tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest -v`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_routes.py
git commit -m "feat: integrate admin router, analytics middleware, and /api/me endpoint"
```

---

### Task 9: Integration Health Logging

**Files:**
- Modify: `app/torn_client.py`
- Modify: `tests/test_torn_client.py`

This task adds integration health logging to outgoing HTTP calls in torn_client.py. Each call to Torn API, TornStats, or YATA logs success/failure/timing to the analytics store.

- [ ] **Step 1: Add analytics_store reference to TornClient**

Modify `TornClient.__init__` in `app/torn_client.py` to accept an optional analytics store:

```python
class TornClient:
    def __init__(self, api_key: str, cache_ttl: int = 60, analytics_store=None) -> None:
        self._api_key = api_key
        self._cache_ttl = cache_ttl
        self._http = httpx.AsyncClient(timeout=15.0)
        self._cache: dict[str, tuple[float, Any]] = {}
        self._analytics = analytics_store
```

- [ ] **Step 2: Add a helper method for logging**

Add to `TornClient`:

```python
    def _log_integration(self, service: str, endpoint: str, success: bool, elapsed_ms: float, error: str | None = None) -> None:
        if self._analytics:
            try:
                self._analytics.log_integration(service, endpoint, success, elapsed_ms, error)
            except Exception:
                pass
```

- [ ] **Step 3: Add logging to fetch_members**

After the `resp.raise_for_status()` call in `fetch_members`, wrap the HTTP call with timing and logging:

```python
    async def fetch_members(self) -> list[FactionMember]:
        cached = self._get_cached("members")
        if cached is not None:
            return cached
        start = time.time()
        try:
            resp = await self._http.get(f"{V2_BASE}/faction/members", params={"key": self._api_key})
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/members", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/members", False, (time.time() - start) * 1000, str(e))
            raise
        members = [FactionMember(**m) for m in raw["members"]]
        self._set_cached("members", members)
        return members
```

Apply the same pattern to: `fetch_war`, `fetch_chain`, `fetch_member_bars`, `fetch_yata_members`, `fetch_enemy_members`, `fetch_faction_info`, `fetch_personalstats`, `fetch_tornstats_spy`.

For each method:
- Record `start = time.time()` before the HTTP call
- Wrap the HTTP call + response parsing in try/except
- On success: `self._log_integration(service, endpoint, True, elapsed, None)`
- On failure: `self._log_integration(service, endpoint, False, elapsed, str(e))`

Service names:
- `"torn_api"` for all Torn API calls (V1 and V2)
- `"tornstats"` for TornStats calls
- `"yata"` for YATA calls

For `fetch_yata_members` which already catches exceptions internally, add logging inside the try/except:

```python
    async def fetch_yata_members(self, api_key: str | None = None) -> dict | None:
        cached = self._get_cached("yata_members", ttl=YATA_CACHE_TTL)
        if cached is not None:
            return cached
        key = api_key or self._api_key
        start = time.time()
        try:
            resp = await self._http.get(f"{YATA_BASE}/faction/members/", params={"key": key}, timeout=8.0)
            resp.raise_for_status()
            data = await _json(resp)
            if "error" in data:
                self._log_integration("yata", "/api/v1/faction/members/", False, (time.time() - start) * 1000, "API error response")
                return None
            self._log_integration("yata", "/api/v1/faction/members/", True, (time.time() - start) * 1000)
            self._set_cached("yata_members", data)
            return data
        except Exception as e:
            self._log_integration("yata", "/api/v1/faction/members/", False, (time.time() - start) * 1000, str(e))
            return None
```

- [ ] **Step 4: Update main.py lifespan to pass analytics_store to TornClient**

In `app/main.py`, update the lifespan to pass analytics_store:

```python
torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL, analytics_store=analytics_store)
```

Note: analytics_store must be created before torn_client. Reorder in lifespan:

```python
analytics_store = AnalyticsStore(db_path="data/analytics.db")
analytics_store.cleanup(days=30)
torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL, analytics_store=analytics_store)
key_store = KeyStore(db_path="data/keys.db", encryption_key=ENCRYPTION_KEY)
admin_mod.init(key_store, analytics_store, torn_client, time.time())
```

- [ ] **Step 5: Run all tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest -v`
Expected: All tests PASS. (Existing torn_client tests don't pass analytics_store, so `self._analytics` is `None` and logging is skipped.)

- [ ] **Step 6: Commit**

```bash
git add app/torn_client.py app/main.py
git commit -m "feat: add integration health logging to TornClient for all outgoing API calls"
```

---

### Task 10: Frontend — HTML & Navigation

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Add Admin tab to navigation**

In `static/index.html`, replace the `<nav class="tabs">` block:

```html
    <nav class="tabs">
        <button class="tab active" data-tab="our-team" onclick="switchTab('our-team')">Our Team <span id="our-count" class="badge">0</span></button>
        <button class="tab" data-tab="enemy" onclick="switchTab('enemy')">Enemy Targets <span id="enemy-count" class="badge">0</span></button>
        <button class="tab tab-admin" data-tab="admin" onclick="switchTab('admin')" id="admin-tab" style="display:none">&#9881; Admin</button>
    </nav>
```

- [ ] **Step 2: Add Admin tab content panel**

After the `<!-- ENEMY TAB -->` div (before `</main>`), add:

```html
        <!-- ADMIN TAB -->
        <div id="tab-admin" class="tab-content">
            <div id="admin-loading" class="admin-loading">Authenticating...</div>
            <div id="admin-panel" style="display:none">
                <!-- System Card -->
                <div class="admin-card">
                    <h2 class="admin-card-title">System</h2>
                    <div id="admin-system" class="admin-card-body">Loading...</div>
                </div>

                <!-- API Keys Card -->
                <div class="admin-card">
                    <h2 class="admin-card-title">API Keys</h2>
                    <div id="admin-keys" class="admin-card-body">Loading...</div>
                </div>

                <!-- Usage Card -->
                <div class="admin-card">
                    <div class="admin-card-header">
                        <h2 class="admin-card-title">Usage</h2>
                        <div class="admin-range-selector">
                            <button class="range-btn active" data-days="7" onclick="setAdminRange(7)">7d</button>
                            <button class="range-btn" data-days="14" onclick="setAdminRange(14)">14d</button>
                            <button class="range-btn" data-days="30" onclick="setAdminRange(30)">30d</button>
                        </div>
                    </div>
                    <div id="admin-usage" class="admin-card-body">Loading...</div>
                </div>
            </div>
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: add admin tab and panel structure to HTML"
```

---

### Task 11: Frontend — Admin JavaScript

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add admin API functions**

Add after the existing `api` object in `static/app.js`:

```javascript
// --- Admin API ---
let adminRange = 7;
let isAdmin = false;

const adminApi = {
    _authHeaders() {
        const token = localStorage.getItem('adminToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },
    me: () => fetch('/api/me', { headers: api._headers() }).then(r => r.json()),
    session: () => fetch('/api/admin/session', {
        method: 'POST',
        headers: api._headers(),
    }).then(r => { if (!r.ok) throw new Error('Session failed'); return r.json(); }),
    system: () => fetch('/api/admin/system', { headers: adminApi._authHeaders() }).then(r => {
        if (r.status === 401) { localStorage.removeItem('adminToken'); throw new Error('unauthorized'); }
        return r.json();
    }),
    keys: () => fetch('/api/admin/keys', { headers: adminApi._authHeaders() }).then(r => r.json()),
    deleteKey: (pid) => fetch(`/api/admin/keys/${pid}`, { method: 'DELETE', headers: adminApi._authHeaders() }).then(r => r.json()),
    requestStats: (days) => fetch(`/api/admin/stats/requests?days=${days}`, { headers: adminApi._authHeaders() }).then(r => r.json()),
    userStats: (days) => fetch(`/api/admin/stats/users?days=${days}`, { headers: adminApi._authHeaders() }).then(r => r.json()),
    errorStats: (days) => fetch(`/api/admin/stats/errors?days=${days}`, { headers: adminApi._authHeaders() }).then(r => r.json()),
};
```

- [ ] **Step 2: Add admin visibility check**

Add function to check admin status and show/hide tab:

```javascript
async function checkAdmin() {
    try {
        const data = await adminApi.me();
        isAdmin = data.is_admin;
        const tab = document.getElementById('admin-tab');
        if (tab) tab.style.display = isAdmin ? '' : 'none';
    } catch (e) {
        isAdmin = false;
    }
}
```

Call `checkAdmin()` inside `showApp()` after displaying the content:

```javascript
function showApp() {
    document.getElementById('login-gate').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    const name = localStorage.getItem('myKeyName');
    if (name) document.getElementById('user-info').textContent = name;
    checkAdmin();
}
```

- [ ] **Step 3: Add JWT flow for admin tab**

Update `switchTab` to handle the admin tab:

```javascript
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
    localStorage.setItem('activeTab', tab);
    if (tab === 'admin') loadAdminPanel();
}

async function ensureAdminToken() {
    const token = localStorage.getItem('adminToken');
    if (token) {
        // Quick validation — try a request
        try {
            const resp = await fetch('/api/admin/system', { headers: { 'Authorization': `Bearer ${token}` } });
            if (resp.ok) return true;
        } catch (e) { /* fall through */ }
    }
    // Get new token
    try {
        const data = await adminApi.session();
        localStorage.setItem('adminToken', data.token);
        return true;
    } catch (e) {
        return false;
    }
}

async function loadAdminPanel() {
    const loading = document.getElementById('admin-loading');
    const panel = document.getElementById('admin-panel');
    loading.style.display = 'block';
    panel.style.display = 'none';

    const ok = await ensureAdminToken();
    if (!ok) {
        loading.textContent = 'Admin authentication failed.';
        return;
    }
    loading.style.display = 'none';
    panel.style.display = 'block';
    refreshAdminPanel();
}
```

- [ ] **Step 4: Add admin panel render functions**

```javascript
async function refreshAdminPanel() {
    try {
        const [sys, keys, reqStats, userStats, errStats] = await Promise.all([
            adminApi.system(),
            adminApi.keys(),
            adminApi.requestStats(adminRange),
            adminApi.userStats(adminRange),
            adminApi.errorStats(adminRange),
        ]);
        renderAdminSystem(sys);
        renderAdminKeys(keys);
        renderAdminUsage(reqStats, userStats, errStats);
    } catch (e) {
        console.error('Admin refresh failed:', e);
    }
}

function renderAdminSystem(sys) {
    const uptimeH = Math.floor(sys.uptime_seconds / 3600);
    const uptimeM = Math.floor((sys.uptime_seconds % 3600) / 60);
    const lastRefresh = sys.cache.last_refresh ? new Date(sys.cache.last_refresh * 1000).toLocaleTimeString() : '—';

    let integrationsHtml = '';
    for (const [name, info] of Object.entries(sys.integrations)) {
        const statusClass = info.status === 'ok' ? 'status-ok' : info.status === 'error' ? 'status-error' : 'status-unknown';
        const label = info.status === 'ok' ? 'OK' : info.status === 'error' ? `Error` : 'No data';
        const errorDetail = info.last_error ? ` — ${info.last_error}` : '';
        integrationsHtml += `<span class="integration-badge ${statusClass}" title="${name}: ${label}${errorDetail}">${name}: ${label}</span> `;
    }

    document.getElementById('admin-system').innerHTML = `
        <div class="admin-system-grid">
            <div><strong>Uptime:</strong> ${uptimeH}h ${uptimeM}m</div>
            <div><strong>Version:</strong> ${sys.version}</div>
            <div><strong>Cache:</strong> ${sys.cache.entries} entries, last refresh ${lastRefresh}</div>
        </div>
        <div class="admin-integrations">${integrationsHtml}</div>
    `;
}

function renderAdminKeys(data) {
    const pct = data.total_faction_members > 0 ? Math.round(data.registered_count / data.total_faction_members * 100) : 0;
    const keysRows = data.keys.map(k => {
        const type = k.is_faction_key ? '<span class="badge-faction">faction</span>' : 'personal';
        const date = k.created_at ? new Date(k.created_at).toLocaleDateString() : '—';
        const removeBtn = `<button class="btn-remove-key" onclick="adminRemoveKey(${k.player_id}, '${k.player_name.replace(/'/g, "\\'")}')">Remove</button>`;
        return `<tr><td>${k.player_name}</td><td>${k.player_id}</td><td>${type}</td><td>${date}</td><td>${removeBtn}</td></tr>`;
    }).join('');

    document.getElementById('admin-keys').innerHTML = `
        <div class="coverage-bar-wrap">
            <div class="coverage-label">${data.registered_count}/${data.total_faction_members} members registered (${pct}%)</div>
            <div class="coverage-track"><div class="coverage-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="table-wrap">
            <table>
                <thead><tr><th>Name</th><th>ID</th><th>Type</th><th>Registered</th><th></th></tr></thead>
                <tbody>${keysRows}</tbody>
            </table>
        </div>
    `;
}

function renderAdminUsage(reqStats, userStats, errStats) {
    // Bar chart
    const maxCount = Math.max(...reqStats.per_day.map(d => d.count), 1);
    const barsHtml = reqStats.per_day.map(d => {
        const pct = (d.count / maxCount * 100).toFixed(0);
        const label = d.date.slice(5); // MM-DD
        return `<div class="bar-col"><div class="bar" style="height:${pct}%" title="${d.date}: ${d.count} requests, avg ${d.avg_response_ms}ms"></div><div class="bar-label">${label}</div></div>`;
    }).join('');

    // Users table
    const usersRows = userStats.users.map(u => {
        const lastSeen = u.last_seen ? new Date(u.last_seen).toLocaleString() : '—';
        return `<tr><td>${u.player_name}</td><td>${lastSeen}</td><td>${u.request_count}</td></tr>`;
    }).join('');

    // Errors table
    const errRows = errStats.errors.map(e => {
        const lastOccurred = e.last_occurred ? new Date(e.last_occurred).toLocaleString() : '—';
        return `<tr><td>${e.endpoint}</td><td>${e.status_code}</td><td>${e.count}</td><td>${lastOccurred}</td></tr>`;
    }).join('');

    document.getElementById('admin-usage').innerHTML = `
        <h3 class="admin-section-title">Requests per day</h3>
        <div class="bar-chart">${barsHtml || '<div class="admin-empty">No data yet</div>'}</div>
        <div class="admin-total">Total: ${reqStats.total_requests} requests</div>

        <h3 class="admin-section-title">Active Users</h3>
        <div class="table-wrap">
            <table><thead><tr><th>Name</th><th>Last Seen</th><th>Requests</th></tr></thead>
            <tbody>${usersRows || '<tr><td colspan="3" class="admin-empty">No data</td></tr>'}</tbody></table>
        </div>

        <h3 class="admin-section-title">Errors</h3>
        <div class="table-wrap">
            <table><thead><tr><th>Endpoint</th><th>Status</th><th>Count</th><th>Last</th></tr></thead>
            <tbody>${errRows || '<tr><td colspan="4" class="admin-empty">No errors 🎉</td></tr>'}</tbody></table>
        </div>
    `;
}

async function adminRemoveKey(pid, name) {
    if (!confirm(`Remove API key for ${name} (${pid})?`)) return;
    try {
        await adminApi.deleteKey(pid);
        refreshAdminPanel();
    } catch (e) {
        alert('Failed to remove key: ' + e.message);
    }
}

function setAdminRange(days) {
    adminRange = days;
    document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.days) === days));
    refreshAdminPanel();
}
```

- [ ] **Step 5: Update initTab to respect admin tab visibility**

Update the `initTab` function — if saved tab is 'admin' but user is not admin, fall back to 'our-team':

```javascript
function initTab() {
    const saved = localStorage.getItem('activeTab');
    if (saved && saved !== 'admin') switchTab(saved);
    // Admin tab restored after checkAdmin() runs
}
```

Also update `checkAdmin()` to restore admin tab if it was saved:

```javascript
async function checkAdmin() {
    try {
        const data = await adminApi.me();
        isAdmin = data.is_admin;
        const tab = document.getElementById('admin-tab');
        if (tab) tab.style.display = isAdmin ? '' : 'none';
        // Restore admin tab if it was the saved tab
        if (isAdmin && localStorage.getItem('activeTab') === 'admin') {
            switchTab('admin');
        }
    } catch (e) {
        isAdmin = false;
    }
}
```

- [ ] **Step 6: Update logout to clear admin token**

Update `logout()`:

```javascript
function logout() {
    localStorage.removeItem('myKeyPlayer');
    localStorage.removeItem('myKeyName');
    localStorage.removeItem('adminToken');
    document.getElementById('login-gate').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}
```

- [ ] **Step 7: Commit**

```bash
git add static/app.js
git commit -m "feat: add admin panel JavaScript — JWT flow, data fetching, rendering"
```

---

### Task 12: Frontend — Admin CSS

**Files:**
- Modify: `static/style.css`

- [ ] **Step 1: Add admin tab alignment and styles**

Append to `static/style.css` before the `/* === Mobile === */` section:

```css
/* === Admin Tab === */
.tab-admin { margin-left: auto; }

/* === Admin Panel === */
.admin-loading { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; }

.admin-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.admin-card-title { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; font-weight: 600; }
.admin-card-header { display: flex; justify-content: space-between; align-items: center; }
.admin-card-body { font-size: 0.8rem; }

.admin-system-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem; }
.admin-system-grid div { color: var(--text-muted); }
.admin-system-grid strong { color: var(--text); }

.admin-integrations { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.integration-badge { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; }
.status-ok { background: var(--green-bg); color: var(--green); }
.status-error { background: var(--red-bg); color: var(--red); }
.status-unknown { background: var(--bg-elevated); color: var(--text-dim); }

/* Coverage bar */
.coverage-bar-wrap { margin-bottom: 0.75rem; }
.coverage-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.3rem; }
.coverage-track { height: 6px; background: var(--bg-elevated); border-radius: 3px; overflow: hidden; }
.coverage-fill { height: 100%; background: var(--green); border-radius: 3px; transition: width 0.3s; }

.badge-faction { font-size: 0.65rem; background: var(--purple-bg); color: var(--purple); padding: 0.05rem 0.3rem; border-radius: 3px; font-weight: 600; }

.btn-remove-key { padding: 0.2rem 0.5rem; background: var(--red-bg); border: 1px solid var(--red-border); color: var(--red); border-radius: 3px; font-size: 0.7rem; cursor: pointer; min-height: 28px; }
.btn-remove-key:hover { filter: brightness(1.2); }

/* Bar chart */
.bar-chart { display: flex; align-items: flex-end; gap: 4px; height: 80px; margin: 0.5rem 0; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.bar { width: 100%; background: var(--blue); border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.3s; }
.bar-label { font-size: 0.6rem; color: var(--text-dim); margin-top: 0.2rem; }
.admin-total { font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.75rem; }

.admin-section-title { font-size: 0.75rem; color: var(--text-muted); margin: 0.75rem 0 0.4rem; font-weight: 600; }
.admin-empty { color: var(--text-dim); text-align: center; padding: 0.5rem; }

/* Range selector */
.admin-range-selector { display: flex; gap: 0.25rem; }
.range-btn { padding: 0.2rem 0.5rem; background: var(--btn-bg); border: 1px solid var(--btn-border); color: var(--btn-text); border-radius: 4px; cursor: pointer; font-size: 0.7rem; min-height: 28px; }
.range-btn.active { background: var(--green-bg); border-color: var(--green-border); color: var(--green); }
.range-btn:hover { background: var(--btn-hover); }
```

- [ ] **Step 2: Add admin-specific mobile styles**

Add inside the existing `@media (max-width: 768px)` block:

```css
    .admin-system-grid { grid-template-columns: 1fr; }
    .bar-chart { height: 60px; }
    .admin-card { padding: 0.75rem; }
```

- [ ] **Step 3: Verify visual appearance**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run uvicorn app.main:app --reload`
Open browser to `http://localhost:8000`. Log in with an API key. If the player_id matches `ADMIN_PLAYER_IDS`, the Admin tab should appear right-aligned. Click it to verify:
- System card shows uptime, version, integrations
- API Keys card shows registered keys with coverage bar
- Usage card shows bar chart, users, errors with range selector

- [ ] **Step 4: Run all tests to confirm nothing is broken**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest -v`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add static/style.css static/index.html
git commit -m "feat: add admin panel CSS — cards, bar chart, coverage bar, integration badges"
```

---

### Task 13: Final Integration Test & Cleanup

**Files:**
- Modify: `tests/test_admin.py` (optional: add middleware logging test)
- Verify: `.env.example`

- [ ] **Step 1: Add middleware logging test**

Append to `tests/test_admin.py`:

```python
@pytest.mark.asyncio
async def test_middleware_logs_requests(mock_client, mock_store):
    """Verify the analytics middleware logs requests when analytics_store is set."""
    from app.analytics import AnalyticsStore
    import tempfile, os
    with tempfile.TemporaryDirectory() as tmp:
        real_analytics = AnalyticsStore(db_path=os.path.join(tmp, "test.db"))
        patches = (
            patch("app.main.torn_client", mock_client),
            patch("app.main.key_store", mock_store),
            patch("app.main.analytics_store", real_analytics),
        )
        with patches[0], patches[1], patches[2]:
            from app.main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                await ac.get("/api/overview", headers={"X-Player-Id": "123"})
        stats = real_analytics.get_request_stats(days=1)
        assert stats["total_requests"] >= 1
        users = real_analytics.get_user_stats(days=1)
        pids = {u["player_id"] for u in users}
        assert 123 in pids
```

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest -v`
Expected: All tests PASS.

- [ ] **Step 3: Update .env.example**

Add new env vars to `.env.example`:

```
JWT_SECRET=your-secret-here-generate-with-python-c-import-secrets-print(secrets.token_urlsafe(32))
APP_VERSION=dev
```

- [ ] **Step 4: Final commit**

```bash
git add tests/test_admin.py .env.example
git commit -m "feat: add middleware logging test and update .env.example with admin config"
```
