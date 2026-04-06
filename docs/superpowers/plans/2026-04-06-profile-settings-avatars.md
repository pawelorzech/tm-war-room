# Profile, Settings, Avatars & Presence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Backblaze B2 avatar caching, a unified `/settings` profile page, hub-wide presence heartbeat, and `<Avatar>` display throughout chat/team/sidebar.

**Architecture:** Backend scheduler fetches Torn profile images every 12h, uploads to public B2 bucket `tmhubmedia` as `avatars/{player_id}.jpg`, stores URLs in SQLite. Frontend reads the full avatar map once at app load via `AvatarContext`. Presence uses a `POST /api/heartbeat` endpoint called from AppShell every 30s, replacing the WebSocket-only online counter.

**Tech Stack:** Python `b2sdk` (B2 uploads), `httpx` (image download), APScheduler (scheduler), SQLite migrations, Next.js 15 / React 19 / Tailwind v4.

---

## File Map

**Create:**
- `api/b2_client.py` — B2 thin wrapper
- `api/db/migrations/028_avatar_url.sql` — `avatar_url`, `avatar_fetched_at` on `member_keys`
- `api/db/migrations/029_presence.sql` — `player_presence` table
- `api/db/repos/presence_repository.py` — heartbeat upsert + get_online
- `api/scheduler/jobs/refresh_avatars.py` — 12h avatar sync job
- `frontend/src/contexts/AvatarContext.tsx` — avatar URL map context
- `frontend/src/components/ui/Avatar.tsx` — `<Avatar>` component
- `frontend/src/app/settings/page.tsx` — unified settings/profile page

**Modify:**
- `pyproject.toml` — add `b2sdk`
- `api/db/repos/keys.py` — add `set_avatar`, `get_avatar_map`
- `api/main.py` — add `/api/heartbeat`, `/api/members/avatars`, `/api/profile/me`; register avatar scheduler
- `api/routers/chat.py` — `/online` uses `player_presence` table
- `api/scheduler/engine.py` — register `refresh_avatars` job
- `frontend/src/lib/api-client.ts` — add `heartbeat`, `memberAvatars`, `profileMe`
- `frontend/src/components/layout/AppShell.tsx` — heartbeat loop + `AvatarProvider` wrapper
- `frontend/src/components/chat/MessageBubble.tsx` — `<Avatar>` next to messages
- `frontend/src/components/chat/ChatLayout.tsx` — `<Avatar>` in online list
- `frontend/src/components/war/MemberCard.tsx` — `<Avatar>` in member cards
- `frontend/src/components/war/MemberTable.tsx` — `<Avatar>` in member table rows
- `frontend/src/components/layout/Sidebar.tsx` — `<Avatar>` in user panel + link to settings
- `frontend/src/app/stakeout/page.tsx` — `<Avatar>` in stakeout rows
- `frontend/src/app/notifications/page.tsx` — remove push settings section (moved to /settings)
- `frontend/src/lib/nav-data.ts` — add Settings nav item

**Tests:**
- `tests/test_b2_client.py`
- `tests/test_presence_repo.py`
- `tests/test_avatar_endpoints.py`

---

## Task 1: B2 client + dependency

**Files:**
- Create: `api/b2_client.py`
- Modify: `pyproject.toml`
- Test: `tests/test_b2_client.py`

- [ ] **Step 1: Add b2sdk to pyproject.toml**

In `pyproject.toml`, add `"b2sdk>=2.5.0"` to `dependencies`:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "httpx>=0.28.0",
    "cryptography>=44.0.0",
    "PyJWT>=2.8.0",
    "apscheduler>=4.0.0a5",
    "pywebpush>=2.0.0",
    "b2sdk>=2.5.0",
]
```

- [ ] **Step 2: Install the dependency**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room
uv sync
```

Expected: resolves and installs b2sdk.

- [ ] **Step 3: Write the failing test**

Create `tests/test_b2_client.py`:

```python
import pytest
import os
from unittest.mock import patch, MagicMock


def test_is_configured_false_when_env_missing(monkeypatch):
    monkeypatch.delenv("B2_APPLICATION_KEY_ID", raising=False)
    monkeypatch.delenv("B2_APPLICATION_KEY", raising=False)
    monkeypatch.delenv("B2_PUBLIC_URL", raising=False)
    import importlib
    import api.b2_client as b2
    importlib.reload(b2)
    assert b2.is_configured() is False


def test_is_configured_true_when_env_set(monkeypatch):
    monkeypatch.setenv("B2_APPLICATION_KEY_ID", "key_id")
    monkeypatch.setenv("B2_APPLICATION_KEY", "key_secret")
    monkeypatch.setenv("B2_PUBLIC_URL", "https://example.com")
    monkeypatch.setenv("B2_BUCKET_NAME", "tmhubmedia")
    import importlib
    import api.b2_client as b2
    importlib.reload(b2)
    assert b2.is_configured() is True


def test_upload_bytes_returns_public_url(monkeypatch):
    monkeypatch.setenv("B2_APPLICATION_KEY_ID", "key_id")
    monkeypatch.setenv("B2_APPLICATION_KEY", "key_secret")
    monkeypatch.setenv("B2_PUBLIC_URL", "https://cdn.example.com")
    monkeypatch.setenv("B2_BUCKET_NAME", "tmhubmedia")

    mock_bucket = MagicMock()
    mock_api = MagicMock()
    mock_api.get_bucket_by_name.return_value = mock_bucket

    import importlib
    import api.b2_client as b2
    importlib.reload(b2)

    with patch.object(b2, "_get_api", return_value=mock_api):
        url = b2.upload_bytes("avatars/123.jpg", b"img_data", "image/jpeg")

    mock_bucket.upload_bytes.assert_called_once_with(b"img_data", "avatars/123.jpg", content_type="image/jpeg")
    assert url == "https://cdn.example.com/avatars/123.jpg"
```

- [ ] **Step 4: Run test to verify it fails**

```bash
uv run pytest tests/test_b2_client.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `api.b2_client` doesn't exist yet.

- [ ] **Step 5: Create `api/b2_client.py`**

```python
from __future__ import annotations
import os
import logging

logger = logging.getLogger("tm-hub.b2")

_KEY_ID = os.getenv("B2_APPLICATION_KEY_ID", "")
_KEY = os.getenv("B2_APPLICATION_KEY", "")
_BUCKET_NAME = os.getenv("B2_BUCKET_NAME", "tmhubmedia")
_PUBLIC_URL = os.getenv("B2_PUBLIC_URL", "").rstrip("/")


def is_configured() -> bool:
    return bool(_KEY_ID and _KEY and _PUBLIC_URL)


def _get_api():
    from b2sdk.v2 import B2Api, InMemoryAccountInfo
    info = InMemoryAccountInfo()
    api = B2Api(info)
    api.authorize_account("production", _KEY_ID, _KEY)
    return api


def upload_bytes(remote_path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to B2, return public URL. Raises if B2 not configured."""
    api = _get_api()
    bucket = api.get_bucket_by_name(_BUCKET_NAME)
    bucket.upload_bytes(data, remote_path, content_type=content_type)
    return f"{_PUBLIC_URL}/{remote_path}"
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
uv run pytest tests/test_b2_client.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add api/b2_client.py pyproject.toml tests/test_b2_client.py
git commit -m "feat: add B2 client for media uploads"
```

---

## Task 2: DB migrations — avatar_url + presence

**Files:**
- Create: `api/db/migrations/028_avatar_url.sql`
- Create: `api/db/migrations/029_presence.sql`

- [ ] **Step 1: Create migration 028**

Create `api/db/migrations/028_avatar_url.sql`:

```sql
ALTER TABLE member_keys ADD COLUMN avatar_url TEXT;
ALTER TABLE member_keys ADD COLUMN avatar_fetched_at INTEGER;
```

- [ ] **Step 2: Create migration 029**

Create `api/db/migrations/029_presence.sql`:

```sql
CREATE TABLE IF NOT EXISTS player_presence (
    player_id  INTEGER PRIMARY KEY,
    last_seen  INTEGER NOT NULL
);
```

- [ ] **Step 3: Verify migrations run cleanly**

```bash
uv run pytest tests/test_migrations.py -v
```

Expected: all migration tests PASS (the runner applies new migrations automatically).

- [ ] **Step 4: Commit**

```bash
git add api/db/migrations/028_avatar_url.sql api/db/migrations/029_presence.sql
git commit -m "feat: db migrations for avatar_url and player_presence"
```

---

## Task 3: KeyRepository avatar methods

**Files:**
- Modify: `api/db/repos/keys.py`
- Test: `tests/test_db.py` (add to existing file)

- [ ] **Step 1: Write the failing tests**

Open `tests/test_db.py` and add at the end:

```python
import os
from api.db.repos.keys import KeyRepository
from api.db.migrations.runner import run_migrations
from cryptography.fernet import Fernet


@pytest.fixture
def key_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    key = Fernet.generate_key().decode()
    repo = KeyRepository(db_path, key)
    repo.save_key(101, "Alpha", "torn_key_1")
    repo.save_key(102, "Bravo", "torn_key_2")
    return repo


class TestAvatarMethods:
    def test_get_avatar_map_empty_initially(self, key_repo):
        result = key_repo.get_avatar_map()
        assert result == {}

    def test_set_and_get_avatar(self, key_repo):
        key_repo.set_avatar(101, "https://cdn.example.com/avatars/101.jpg", 1700000000)
        result = key_repo.get_avatar_map()
        assert result == {101: "https://cdn.example.com/avatars/101.jpg"}

    def test_set_avatar_overwrites(self, key_repo):
        key_repo.set_avatar(101, "https://cdn.example.com/avatars/101.jpg", 1700000000)
        key_repo.set_avatar(101, "https://cdn.example.com/avatars/101_new.jpg", 1700000001)
        result = key_repo.get_avatar_map()
        assert result[101] == "https://cdn.example.com/avatars/101_new.jpg"

    def test_get_avatar_map_excludes_null(self, key_repo):
        # player 102 has no avatar set
        key_repo.set_avatar(101, "https://cdn.example.com/avatars/101.jpg", 1700000000)
        result = key_repo.get_avatar_map()
        assert 102 not in result
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_db.py::TestAvatarMethods -v
```

Expected: `AttributeError: 'KeyRepository' object has no attribute 'set_avatar'`

- [ ] **Step 3: Add methods to `api/db/repos/keys.py`**

After `get_keys_metadata`, add:

```python
def set_avatar(self, player_id: int, url: str, fetched_at: int) -> None:
    conn = sqlite3.connect(self._db_path)
    conn.execute(
        "UPDATE member_keys SET avatar_url = ?, avatar_fetched_at = ? WHERE player_id = ?",
        (url, fetched_at, player_id),
    )
    conn.commit()
    conn.close()

def get_avatar_map(self) -> dict[int, str]:
    conn = sqlite3.connect(self._db_path)
    rows = conn.execute(
        "SELECT player_id, avatar_url FROM member_keys WHERE avatar_url IS NOT NULL"
    ).fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_db.py::TestAvatarMethods -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/db/repos/keys.py tests/test_db.py
git commit -m "feat: KeyRepository avatar methods (set_avatar, get_avatar_map)"
```

---

## Task 4: PresenceRepository + heartbeat endpoint

**Files:**
- Create: `api/db/repos/presence_repository.py`
- Test: `tests/test_presence_repo.py`
- Modify: `api/main.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_presence_repo.py`:

```python
import os
import time
import pytest
from api.db.repos.presence_repository import PresenceRepository
from api.db.migrations.runner import run_migrations


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return PresenceRepository(db_path)


def test_get_online_empty(repo):
    assert repo.get_online(ttl_seconds=120) == []


def test_heartbeat_adds_player(repo):
    now = int(time.time())
    repo.heartbeat(42)
    online = repo.get_online(ttl_seconds=120)
    assert 42 in online


def test_heartbeat_updates_existing(repo):
    repo.heartbeat(42)
    repo.heartbeat(42)
    online = repo.get_online(ttl_seconds=120)
    assert online.count(42) == 1


def test_get_online_excludes_stale(repo):
    # Insert stale entry directly
    import sqlite3
    conn = sqlite3.connect(repo._db_path)
    conn.execute(
        "INSERT INTO player_presence (player_id, last_seen) VALUES (?, ?)",
        (99, int(time.time()) - 300),  # 5 minutes ago
    )
    conn.commit()
    conn.close()
    online = repo.get_online(ttl_seconds=120)
    assert 99 not in online
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_presence_repo.py -v
```

Expected: `ModuleNotFoundError: No module named 'api.db.repos.presence_repository'`

- [ ] **Step 3: Create `api/db/repos/presence_repository.py`**

```python
from __future__ import annotations
import time
from api.db.repos.base import BaseRepository


class PresenceRepository(BaseRepository):

    def heartbeat(self, player_id: int) -> None:
        self.mutate(
            """INSERT INTO player_presence (player_id, last_seen)
               VALUES (?, ?)
               ON CONFLICT(player_id) DO UPDATE SET last_seen = excluded.last_seen""",
            (player_id, int(time.time())),
        )

    def get_online(self, ttl_seconds: int = 120) -> list[int]:
        cutoff = int(time.time()) - ttl_seconds
        rows = self.execute(
            "SELECT player_id FROM player_presence WHERE last_seen > ?", (cutoff,)
        )
        return [r[0] for r in rows]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_presence_repo.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Add `/api/heartbeat` endpoint to `api/main.py`**

Find the block of `@app.get("/api/keys")` in `main.py` (around line 653) and add before it:

```python
# Presence repository — set in lifespan
presence_repo: "PresenceRepository | None" = None

@app.post("/api/heartbeat")
async def heartbeat(x_player_id: int = Header()):
    if presence_repo:
        presence_repo.heartbeat(x_player_id)
    return {"ok": True}
```

Also in the `lifespan` function, after `notification_repo` is initialized, add:

```python
from api.db.repos.presence_repository import PresenceRepository
global presence_repo
presence_repo = PresenceRepository(db_path)
```

(Find `db_path` — it's the path used for other repos. Search for `db_path =` in the lifespan.)

- [ ] **Step 6: Write endpoint test**

In `tests/test_avatar_endpoints.py` (create this file):

```python
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [{"player_id": 123, "player_name": "Test", "api_key": "k", "is_faction_key": False}]
    return store


@pytest.mark.asyncio
async def test_heartbeat_returns_ok(mock_store):
    mock_presence = MagicMock()
    with patch("api.main.key_store", mock_store), patch("api.main.presence_repo", mock_presence):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/heartbeat", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    mock_presence.heartbeat.assert_called_once_with(123)
```

- [ ] **Step 7: Run endpoint test**

```bash
uv run pytest tests/test_avatar_endpoints.py::test_heartbeat_returns_ok -v
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/db/repos/presence_repository.py tests/test_presence_repo.py tests/test_avatar_endpoints.py api/main.py
git commit -m "feat: PresenceRepository and /api/heartbeat endpoint"
```

---

## Task 5: `/api/members/avatars` + `/api/profile/me` endpoints

**Files:**
- Modify: `api/main.py`
- Test: `tests/test_avatar_endpoints.py` (extend)

- [ ] **Step 1: Write failing tests**

Append to `tests/test_avatar_endpoints.py`:

```python
@pytest.mark.asyncio
async def test_members_avatars_returns_map(mock_store):
    mock_store._keys = MagicMock()
    mock_store._keys.get_avatar_map.return_value = {101: "https://cdn.example.com/avatars/101.jpg"}
    with patch("api.main.key_store", mock_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/avatars", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "avatars" in data
    assert data["avatars"]["101"] == "https://cdn.example.com/avatars/101.jpg"


@pytest.mark.asyncio
async def test_profile_me_returns_player_data(mock_store):
    import json
    mock_http = MagicMock()
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "player_id": 123, "name": "Test",
        "level": 50, "faction": {"position": "Member"},
        "profile_image": "https://torn.com/img/123.jpg",
        "life": {"current": 500, "maximum": 500},
        "last_action": {"status": "Online", "timestamp": 1700000000},
        "status": {"description": "Okay"},
    }
    mock_http.get = MagicMock(return_value=mock_response)

    from unittest.mock import AsyncMock
    mock_torn_client = MagicMock()
    mock_torn_client._http = AsyncMock()
    mock_torn_client._http.get = AsyncMock(return_value=mock_response)

    with patch("api.main.key_store", mock_store), patch("api.main.torn_client", mock_torn_client):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/profile/me", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_id"] == 123
    assert data["name"] == "Test"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_avatar_endpoints.py -v
```

Expected: `test_members_avatars_returns_map` and `test_profile_me_returns_player_data` FAIL with 404.

- [ ] **Step 3: Add endpoints to `api/main.py`**

After the `heartbeat` endpoint, add:

```python
@app.get("/api/members/avatars")
async def members_avatars(_=Depends(verify_member)):
    return {"avatars": key_store._keys.get_avatar_map()}


@app.get("/api/profile/me")
async def profile_me(x_player_id: int = Header()):
    all_keys = key_store.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    if not user_key:
        raise HTTPException(status_code=404, detail="Key not found")
    resp = await torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "profile,bars", "key": user_key["api_key"]},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw:
        raise HTTPException(status_code=502, detail="Torn API error")
    return {
        "player_id": raw.get("player_id"),
        "name": raw.get("name"),
        "level": raw.get("level"),
        "faction": raw.get("faction"),
        "profile_image": raw.get("profile_image"),
        "life": raw.get("life"),
        "last_action": raw.get("last_action"),
        "status": raw.get("status"),
    }
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/test_avatar_endpoints.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/main.py tests/test_avatar_endpoints.py
git commit -m "feat: /api/members/avatars and /api/profile/me endpoints"
```

---

## Task 6: Update `/api/chat/online` to use presence table

**Files:**
- Modify: `api/routers/chat.py`
- Test: `tests/test_chat.py` (append)

- [ ] **Step 1: Write failing test**

Append to `tests/test_chat.py`:

```python
import time


class TestOnlinePresence:
    def test_online_uses_presence_table(self, chat_repo):
        """get_online_from_presence returns only players within TTL."""
        from api.db.repos.presence_repository import PresenceRepository
        presence_repo = PresenceRepository(chat_repo._db_path)
        presence_repo.heartbeat(111)
        presence_repo.heartbeat(222)
        online = presence_repo.get_online(ttl_seconds=120)
        assert 111 in online
        assert 222 in online
```

- [ ] **Step 2: Run to verify it passes already (just repo test)**

```bash
uv run pytest tests/test_chat.py::TestOnlinePresence -v
```

Expected: PASS (this just tests the repo directly).

- [ ] **Step 3: Update `/online` endpoint in `api/routers/chat.py`**

In `chat.py`, add at the top of the module (after `chat_manager`):
```python
presence_repo = None  # Set by main.py
```

Find the `@router.get("/online")` endpoint (around line 578) and replace:

```python
@router.get("/online")
async def get_online(x_player_id: int = Header()):
    _verify_member(x_player_id)
    return {"online": chat_manager.get_online_players()}
```

with:

```python
@router.get("/online")
async def get_online(x_player_id: int = Header()):
    _verify_member(x_player_id)
    if presence_repo:
        return {"online": presence_repo.get_online(ttl_seconds=120)}
    return {"online": chat_manager.get_online_players()}
```

- [ ] **Step 4: Wire presence_repo in `api/main.py`**

Find where chat router is wired in `main.py`. Look for `chat_mod.` assignments and add:

```python
from api.routers import chat as chat_mod
# existing assignments...
chat_mod.presence_repo = presence_repo
```

(Add after `presence_repo` is created in lifespan.)

- [ ] **Step 5: Run full test suite**

```bash
uv run pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routers/chat.py api/main.py tests/test_chat.py
git commit -m "feat: /api/chat/online now uses heartbeat presence table"
```

---

## Task 7: Avatar scheduler job

**Files:**
- Create: `api/scheduler/jobs/refresh_avatars.py`
- Modify: `api/scheduler/engine.py`

- [ ] **Step 1: Create `api/scheduler/jobs/refresh_avatars.py`**

```python
from __future__ import annotations
import asyncio
import logging
import time

import httpx

logger = logging.getLogger("tm-hub.scheduler.avatars")

REFETCH_INTERVAL = 11 * 3600  # 11h — skip if fetched less than this ago


async def run_refresh_avatars() -> None:
    """Fetch Torn profile images for all registered members and upload to B2."""
    from api.scheduler.engine import get_state
    from api import b2_client

    if not b2_client.is_configured():
        logger.debug("B2 not configured — skipping avatar refresh")
        return

    state = get_state()
    key_repo = state.get("key_repo")
    torn_client = state.get("torn_client")

    if not key_repo or not torn_client:
        logger.warning("Avatar refresh: key_repo or torn_client not in state")
        return

    faction_key_info = key_repo.get_faction_key()
    if not faction_key_info:
        logger.warning("Avatar refresh: no faction key found")
        return

    api_key = faction_key_info["api_key"]
    all_keys = key_repo.get_all_keys()
    now = int(time.time())

    loop = asyncio.get_event_loop()
    updated = 0

    for member in all_keys:
        player_id = member["player_id"]

        # Check if recently fetched (via raw SQL)
        import sqlite3
        conn = sqlite3.connect(key_repo._db_path)
        row = conn.execute(
            "SELECT avatar_fetched_at FROM member_keys WHERE player_id = ?", (player_id,)
        ).fetchone()
        conn.close()
        if row and row[0] and (now - row[0]) < REFETCH_INTERVAL:
            continue

        try:
            resp = await torn_client._http.get(
                f"https://api.torn.com/user/{player_id}",
                params={"selections": "basic", "key": api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            if hasattr(data, "__await__"):
                data = await data

            profile_image_url = data.get("profile_image")
            if not profile_image_url:
                continue

            # Download image
            img_resp = await torn_client._http.get(profile_image_url)
            img_resp.raise_for_status()
            img_data = img_resp.content

            # Upload to B2 in thread pool (b2sdk is sync)
            remote_path = f"avatars/{player_id}.jpg"
            b2_url = await loop.run_in_executor(
                None,
                lambda p=remote_path, d=img_data: b2_client.upload_bytes(p, d, "image/jpeg"),
            )

            key_repo.set_avatar(player_id, b2_url, now)
            updated += 1
            logger.info("Avatar updated for player %d → %s", player_id, b2_url)

        except Exception as exc:
            logger.warning("Avatar refresh failed for player %d: %s", player_id, exc)

    logger.info("Avatar refresh complete: %d updated out of %d", updated, len(all_keys))
```

- [ ] **Step 2: Register in `api/scheduler/engine.py`**

In `create_and_start_scheduler`, add after the existing imports and before the `return scheduler` line:

```python
from api.scheduler.jobs.refresh_avatars import run_refresh_avatars

await scheduler.configure_task("refresh_avatars", func=run_refresh_avatars)
await scheduler.add_schedule(
    "refresh_avatars",
    IntervalTrigger(hours=12),
    id="refresh_avatars_schedule",
)
```

- [ ] **Step 3: Also trigger once on startup in `api/main.py`**

In the lifespan function, after the scheduler is started (after `create_and_start_scheduler`), add:

```python
# Trigger avatar refresh on startup (runs in background)
if b2_client.is_configured():
    asyncio.create_task(run_refresh_avatars_startup())

async def run_refresh_avatars_startup():
    from api.scheduler.jobs.refresh_avatars import run_refresh_avatars
    try:
        await run_refresh_avatars()
    except Exception as e:
        logger.warning("Startup avatar refresh failed: %s", e)
```

Actually, simpler — just add it directly:

```python
import asyncio as _asyncio
_asyncio.create_task(_startup_avatar_refresh())

async def _startup_avatar_refresh():
    from api.scheduler.jobs.refresh_avatars import run_refresh_avatars
    try:
        await run_refresh_avatars()
    except Exception as e:
        logger.warning("Startup avatar refresh failed: %s", e)
```

Place this at the very end of the `lifespan` body, before `yield`.

- [ ] **Step 4: Add `b2_client` import to `api/main.py`**

At the top of `api/main.py` imports, add:

```python
from api import b2_client
```

- [ ] **Step 5: Run full backend tests**

```bash
uv run pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all tests pass (scheduler job has no unit test — integration with B2 is tested manually).

- [ ] **Step 6: Commit**

```bash
git add api/scheduler/jobs/refresh_avatars.py api/scheduler/engine.py api/main.py
git commit -m "feat: avatar scheduler job — refresh Torn profile images every 12h"
```

---

## Task 8: Frontend — api-client + AvatarContext + Avatar component

**Files:**
- Modify: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/contexts/AvatarContext.tsx`
- Create: `frontend/src/components/ui/Avatar.tsx`

- [ ] **Step 1: Add API methods to `frontend/src/lib/api-client.ts`**

At the end of the `api` object (before the closing `}`), add:

```typescript
  heartbeat: () =>
    apiFetch<{ ok: boolean }>('/api/heartbeat', { method: 'POST' }),
  memberAvatars: () =>
    apiFetch<{ avatars: Record<string, string> }>('/api/members/avatars'),
  profileMe: () =>
    apiFetch<{
      player_id: number;
      name: string;
      level: number;
      faction: { position: string; faction_id?: number; faction_name?: string } | null;
      profile_image: string | null;
      life: { current: number; maximum: number } | null;
      last_action: { status: string; timestamp: number } | null;
      status: { description: string } | null;
    }>('/api/profile/me'),
```

- [ ] **Step 2: Create `frontend/src/contexts/AvatarContext.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

type AvatarMap = Record<number, string>;

const AvatarContext = createContext<AvatarMap>({});

export function AvatarProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [avatars, setAvatars] = useState<AvatarMap>({});

  useEffect(() => {
    if (!isLoggedIn) return;
    api.memberAvatars()
      .then(d => {
        // API returns string keys; convert to number keys
        const map: AvatarMap = {};
        for (const [k, v] of Object.entries(d.avatars)) {
          map[Number(k)] = v;
        }
        setAvatars(map);
      })
      .catch(() => {});
  }, [isLoggedIn]);

  return <AvatarContext.Provider value={avatars}>{children}</AvatarContext.Provider>;
}

export function useAvatars(): AvatarMap {
  return useContext(AvatarContext);
}
```

- [ ] **Step 3: Create `frontend/src/components/ui/Avatar.tsx`**

```tsx
'use client';

import Image from 'next/image';
import { useAvatars } from '@/contexts/AvatarContext';

const SIZE_PX: Record<string, number> = { sm: 24, md: 32, lg: 64 };
const SIZE_CLASS: Record<string, string> = {
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-16 h-16 text-xl',
};

// Deterministic color from player_id
const PALETTE = [
  'bg-blue-600', 'bg-purple-600', 'bg-pink-600', 'bg-indigo-600',
  'bg-cyan-600', 'bg-teal-600', 'bg-orange-600', 'bg-rose-600',
];

function getColor(playerId: number): string {
  return PALETTE[playerId % PALETTE.length];
}

interface AvatarProps {
  playerId: number;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ playerId, name, size = 'sm', className = '' }: AvatarProps) {
  const avatars = useAvatars();
  const url = avatars[playerId];
  const initials = name ? name.slice(0, 2).toUpperCase() : String(playerId).slice(-2);
  const px = SIZE_PX[size];
  const cls = SIZE_CLASS[size];

  if (url) {
    return (
      <img
        src={url}
        alt={name || String(playerId)}
        width={px}
        height={px}
        className={`rounded-full object-cover shrink-0 ${cls} ${className}`}
        onError={e => {
          // Fallback to initials on load error
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = 'none';
          const sib = el.nextElementSibling as HTMLElement | null;
          if (sib) sib.style.display = 'flex';
        }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 font-bold text-white ${cls} ${getColor(playerId)} ${className}`}
      title={name || String(playerId)}
    >
      {initials}
    </div>
  );
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room/frontend && npm run build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/contexts/AvatarContext.tsx frontend/src/components/ui/Avatar.tsx
git commit -m "feat: AvatarContext, Avatar component, api-client methods"
```

---

## Task 9: AppShell — heartbeat loop + AvatarProvider

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add heartbeat loop to `ShellContent` and AvatarProvider to `AppShell`**

In `AppShell.tsx`, add heartbeat effect inside `ShellContent` — place it after the `usePDAPolling()` call (around line 78):

```tsx
// Heartbeat — keep hub presence alive
useEffect(() => {
  if (!isLoggedIn) return;
  const beat = () => api.heartbeat().catch(() => {});
  beat();
  const interval = setInterval(beat, 30_000);
  return () => clearInterval(interval);
}, [isLoggedIn]);
```

The exported `AppShell` function (at the bottom of the file) currently looks like:
```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PDAProvider>
      <AuthGate>
        <ShellContent>{children}</ShellContent>
      </AuthGate>
    </PDAProvider>
  );
}
```

Add `AvatarProvider` around `ShellContent`:
```tsx
import { AvatarProvider } from '@/contexts/AvatarContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PDAProvider>
      <AuthGate>
        <AvatarProvider>
          <ShellContent>{children}</ShellContent>
        </AvatarProvider>
      </AuthGate>
    </PDAProvider>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room/frontend && npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git commit -m "feat: AppShell heartbeat loop and AvatarProvider"
```

---

## Task 10: `/settings` page

**Files:**
- Create: `frontend/src/app/settings/page.tsx`
- Modify: `frontend/src/lib/nav-data.ts`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create `frontend/src/app/settings/page.tsx`**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/ui/Avatar';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { usePDA } from '@/contexts/PDAContext';

interface TornProfile {
  player_id: number;
  name: string;
  level: number;
  faction: { position: string; faction_name?: string } | null;
  profile_image: string | null;
  life: { current: number; maximum: number } | null;
  last_action: { status: string } | null;
  status: { description: string } | null;
}

export default function SettingsPage() {
  const { playerId, playerName } = useAuth();
  const { theme, toggle } = useTheme();
  const push = usePushNotifications();
  const { isPDA } = usePDA();
  const [profile, setProfile] = useState<TornProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const loadProfile = useCallback(() => {
    setProfileLoading(true);
    setProfileError(false);
    api.profileMe()
      .then(d => setProfile(d))
      .catch(() => setProfileError(true))
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* ── Profile ── */}
        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Profile</h2>
          {profileLoading ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-bg-elevated" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-bg-elevated rounded" />
                <div className="h-3 w-24 bg-bg-elevated rounded" />
              </div>
            </div>
          ) : profileError ? (
            <p className="text-sm text-text-muted">Could not load profile. <button onClick={loadProfile} className="text-torn-green underline">Retry</button></p>
          ) : profile ? (
            <div className="flex items-center gap-4">
              <Avatar playerId={profile.player_id} name={profile.name} size="lg" />
              <div>
                <p className="text-lg font-semibold text-text-primary">{profile.name}</p>
                <p className="text-sm text-text-secondary">Level {profile.level}</p>
                {profile.faction && (
                  <p className="text-xs text-text-muted">{profile.faction.position}{profile.faction.faction_name ? ` · ${profile.faction.faction_name}` : ''}</p>
                )}
                <p className="text-xs text-text-muted mt-1">ID [{profile.player_id}]</p>
                <a
                  href={`https://www.torn.com/profiles.php?XID=${profile.player_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-torn-blue hover:underline mt-1 inline-block"
                >
                  View on Torn ↗
                </a>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── Notifications ── */}
        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Push Notifications</h2>
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              {isPDA ? 'Native notifications via Torn PDA.' : 'Get alerts even when the app is closed.'}
            </p>
            {isPDA ? (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Connected via PDA</span>
            ) : push.permission === 'granted' && push.subscribed ? (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Enabled</span>
            ) : push.permission === 'denied' ? (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-red/15 text-torn-red font-medium">Blocked</span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-yellow/15 text-torn-yellow font-medium">Disabled</span>
            )}
          </div>

          {!isPDA && !push.supported && (
            <p className="text-xs text-text-muted">Push notifications are not supported in this browser.</p>
          )}
          {!isPDA && push.permission === 'denied' && (
            <div className="bg-torn-red/5 border border-torn-red/20 rounded-lg p-3 text-xs text-text-secondary">
              <p className="font-medium text-torn-red mb-1">Notifications blocked</p>
              <p>Click the lock icon in your browser&apos;s address bar → Notifications → Allow.</p>
            </div>
          )}
          {!isPDA && push.supported && push.permission !== 'denied' && !push.subscribed && (
            <button onClick={push.subscribe}
              className="px-4 py-2 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
              Enable Push Notifications
            </button>
          )}

          {(isPDA || push.subscribed) && (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={push.preferences[key]}
                    onChange={() => push.updatePreferences({ ...push.preferences, [key]: !push.preferences[key] })}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50" />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
              {!isPDA && push.subscribed && (
                <div className="flex gap-2 pt-2 border-t border-border-light">
                  <button onClick={push.sendTest}
                    className="px-3 py-1 text-[10px] rounded text-text-secondary hover:text-text-primary border border-text-secondary/20 hover:border-text-secondary/40 transition-colors">
                    Send Test
                  </button>
                  <button onClick={push.unsubscribe}
                    className="px-3 py-1 text-[10px] rounded text-danger hover:text-danger/80 border border-danger/20 hover:border-danger/40 transition-colors">
                    Disable Push
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── App ── */}
        <section className="bg-bg-card border border-text-secondary/15 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">App</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">Theme</p>
              <p className="text-xs text-text-muted">Currently {theme}</p>
            </div>
            <button onClick={toggle}
              className="px-4 py-2 text-sm rounded-lg border border-text-secondary/20 hover:border-text-secondary/40 text-text-secondary hover:text-text-primary transition-colors">
              {theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Settings to nav in `frontend/src/lib/nav-data.ts`**

In the `faction` group's items array, add Settings at the end:

```ts
{ label: "Settings", href: "/settings", icon: "⚙️" },
```

The faction group becomes:
```ts
{
  id: "faction",
  label: "Faction",
  icon: "👥",
  items: [
    { label: "Our Team", href: "/team", icon: "👥" },
    { label: "Activity", href: "/activity", icon: "🟢" },
    { label: "OC Planner", href: "/oc", icon: "🕴️" },
    { label: "Analytics", href: "/analytics", icon: "📈" },
    { label: "Notifications", href: "/notifications", icon: "🔔" },
    { label: "Settings", href: "/settings", icon: "⚙️" },
  ],
},
```

- [ ] **Step 3: Make sidebar user panel link to /settings**

In `frontend/src/components/layout/Sidebar.tsx`, find the `{/* User panel */}` div (around line 178) and wrap the avatar+name block in a `<Link href="/settings">`:

Replace:
```tsx
<div className="flex items-center gap-2 mb-2 group">
  <div className="w-7 h-7 rounded-full bg-torn-green-dim text-white text-xs font-bold flex items-center justify-center ring-2 ring-transparent group-hover:ring-torn-green/40 transition-all duration-200">
    {playerName?.charAt(0)?.toUpperCase() || "?"}
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium text-text-primary truncate">
      {playerName || "Unknown"}
    </p>
    <p className="text-[10px] text-text-muted">
      [{playerId || "..."}]
    </p>
  </div>
</div>
```

with:
```tsx
<Link href="/settings" className="flex items-center gap-2 mb-2 group cursor-pointer">
  <Avatar playerId={playerId ?? 0} name={playerName ?? undefined} size="sm"
    className="ring-2 ring-transparent group-hover:ring-torn-green/40 transition-all duration-200" />
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium text-text-primary truncate group-hover:text-torn-green transition-colors">
      {playerName || "Unknown"}
    </p>
    <p className="text-[10px] text-text-muted">
      [{playerId || "..."}]
    </p>
  </div>
</Link>
```

Add import at top of `Sidebar.tsx`:
```tsx
import { Avatar } from '@/components/ui/Avatar';
```

- [ ] **Step 4: Build**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room/frontend && npm run build 2>&1 | tail -10
```

Expected: clean build, `/settings` appears in page list.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/settings/page.tsx frontend/src/lib/nav-data.ts frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: /settings page with profile, push notifications, theme"
```

---

## Task 11: Remove push settings from `/notifications` page

**Files:**
- Modify: `frontend/src/app/notifications/page.tsx`

- [ ] **Step 1: Remove the push settings section**

In `frontend/src/app/notifications/page.tsx`, remove the entire `{/* Push Notification Settings */}` block (from line ~89 to ~175). Also remove the `usePushNotifications` and `usePDA` imports and their hook calls since they're no longer used.

The file should keep: the `<h1>Notifications</h1>` header with unread count, the "Mark all read" button, `RefreshButton`, and the notification list. Add a small link pointing to settings:

After the header/button row, add:
```tsx
<p className="text-xs text-text-muted">
  Manage notification preferences in{' '}
  <a href="/settings" className="text-torn-green hover:underline">Settings</a>.
</p>
```

- [ ] **Step 2: Build**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room/frontend && npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/notifications/page.tsx
git commit -m "refactor: move push settings from /notifications to /settings"
```

---

## Task 12: Avatar in chat (MessageBubble + online list)

**Files:**
- Modify: `frontend/src/components/chat/MessageBubble.tsx`
- Modify: `frontend/src/components/chat/ChatLayout.tsx`

- [ ] **Step 1: Add Avatar to MessageBubble**

In `frontend/src/components/chat/MessageBubble.tsx`, add import:

```tsx
import { Avatar } from '@/components/ui/Avatar';
```

The component receives `message.player_id` and `message.player_name`. Find where the message header renders the player name (search for `player_name` in the JSX). Wrap the message layout to show an avatar on the left.

Find the message container (the outermost div in the return). The structure is typically:

```tsx
<div className="flex items-start gap-2">
  <Avatar playerId={message.player_id} name={message.player_name} size="sm" className="mt-0.5" />
  <div className="flex-1 min-w-0">
    {/* existing message content */}
  </div>
</div>
```

Read the existing render to understand exact structure, then add the `<Avatar>` as the first child in the flex row that contains sender name + message content.

- [ ] **Step 2: Add Avatar to online players list in ChatLayout**

In `frontend/src/components/chat/ChatLayout.tsx`, find the online popover (around line 169):

```tsx
{onlinePlayers.map(pid => (
  <div key={pid} className="px-3 py-1.5 text-sm text-text-primary flex items-center gap-2">
    <span className="w-1.5 h-1.5 rounded-full bg-torn-green shrink-0" />
    {memberMap[pid] || `Player ${pid}`}
  </div>
```

Replace with:

```tsx
{onlinePlayers.map(pid => (
  <div key={pid} className="px-3 py-1.5 text-sm text-text-primary flex items-center gap-2">
    <Avatar playerId={pid} name={memberMap[pid]} size="sm" />
    {memberMap[pid] || `Player ${pid}`}
  </div>
```

Add import at top:
```tsx
import { Avatar } from '@/components/ui/Avatar';
```

- [ ] **Step 3: Build**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room/frontend && npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/MessageBubble.tsx frontend/src/components/chat/ChatLayout.tsx
git commit -m "feat: avatars in chat messages and online player list"
```

---

## Task 13: Avatar in team pages + stakeout

**Files:**
- Modify: `frontend/src/components/war/MemberCard.tsx`
- Modify: `frontend/src/components/war/MemberTable.tsx`
- Modify: `frontend/src/app/stakeout/page.tsx`

- [ ] **Step 1: Add Avatar to MemberCard**

In `frontend/src/components/war/MemberCard.tsx`, add import:
```tsx
import { Avatar } from '@/components/ui/Avatar';
```

Find the card header area where `m.name` is displayed. Add `<Avatar playerId={m.id} name={m.name} size="md" />` next to the name. The card already has a colored dot — place avatar before the name:

```tsx
<div className="flex items-center gap-2">
  <Avatar playerId={m.id} name={m.name} size="md" />
  <span className={NAME_COLORS[readiness]}>{m.name}</span>
  {/* existing level/position info */}
</div>
```

- [ ] **Step 2: Add Avatar to MemberTable rows**

In `frontend/src/components/war/MemberTable.tsx`, add import:
```tsx
import { Avatar } from '@/components/ui/Avatar';
```

Find where member rows render the name (search for `m.name`). Add a small avatar before each name:

```tsx
<div className="flex items-center gap-1.5">
  <Avatar playerId={m.id} name={m.name} size="sm" />
  <span>{m.name}</span>
</div>
```

- [ ] **Step 3: Add Avatar to stakeout rows**

In `frontend/src/app/stakeout/page.tsx`, add import:
```tsx
import { Avatar } from '@/components/ui/Avatar';
```

Find the stakeout entry render (each `Stakeout` object has `player_id` and `player_name`). In the row where `player_name` is displayed:

```tsx
<div className="flex items-center gap-2">
  <Avatar playerId={s.player_id} name={s.player_name ?? undefined} size="sm" />
  <span className="font-medium text-text-primary">{s.player_name || `Player ${s.player_id}`}</span>
</div>
```

- [ ] **Step 4: Build**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room/frontend && npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/war/MemberCard.tsx frontend/src/components/war/MemberTable.tsx frontend/src/app/stakeout/page.tsx
git commit -m "feat: avatars in team member cards, table, and stakeout"
```

---

## Task 14: Final verification + push

- [ ] **Step 1: Run full backend test suite**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Final frontend build**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room/frontend && npm run build 2>&1 | tail -15
```

Expected: clean build, `/settings` visible in page list.

- [ ] **Step 3: Bump version in changelog**

In `frontend/src/data/changelog.ts`, bump `CURRENT_VERSION` to `1.5.0` and add entry at the top of `CHANGELOG`:

```ts
{
  version: "1.5.0",
  date: "2026-04-06",
  title: "Profiles, Avatars & Presence",
  changes: [
    { type: "feat", text: "Player avatars — Torn profile images cached on Backblaze B2, shown throughout the app" },
    { type: "feat", text: "Settings page — unified profile view with Torn stats, push notification preferences, and theme toggle" },
    { type: "feat", text: "Hub presence — online counter now shows everyone active in the hub, not just chat users" },
    { type: "improve", text: "Notifications page — simplified to inbox only; settings moved to /settings" },
  ],
},
```

- [ ] **Step 4: Commit changelog + push**

```bash
git add frontend/src/data/changelog.ts
git commit -m "feat: bump version to 1.5.0 — profiles, avatars, presence"
git push
```

Expected: GitHub Actions triggers deploy.

- [ ] **Step 5: Post-deploy browser check**

After deploy completes, open `hub.tri.ovh` in Playwright and verify:
- `/settings` loads with profile section (avatar or initials + name + level)
- `/chat` shows avatar circles next to messages
- `/team` shows avatars in member list
- Online counter in chat shows you (Bombel) as online
- `/notifications` shows inbox without push settings, has "Settings" link
