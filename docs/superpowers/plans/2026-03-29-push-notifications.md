# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web Push notifications for critical game events (loot level 4+, war start, stakeout change, OC ready) with per-user preferences and graceful degradation to in-app notifications.

**Architecture:** Backend: new migration for `push_subscriptions` table, `PushRepository` for CRUD, `PushService` for dispatch via `pywebpush`, and `push` router for subscription management. Trigger points hook into existing `refresh_data` scheduler job. Frontend: Service Worker in `public/sw.js`, `usePushNotifications` hook, and settings UI on the existing `/notifications` page. VAPID keys via env vars; push gracefully disabled if missing.

**Tech Stack:** FastAPI, pywebpush, SQLite, Service Worker API, Web Push API, React 19

---

### Task 1: Add pywebpush dependency

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add pywebpush to dependencies**

In `pyproject.toml`, add `"pywebpush>=2.0.0"` to the `dependencies` list.

- [ ] **Step 2: Install**

Run: `uv sync`
Expected: pywebpush installed successfully.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git -c commit.gpgsign=false commit -m "chore: add pywebpush dependency for Web Push notifications"
```

---

### Task 2: Create push_subscriptions migration and repository

**Files:**
- Create: `api/db/migrations/017_push_subscriptions.sql`
- Create: `api/db/repos/push_repository.py`
- Test: `tests/test_push_repo.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_push_repo.py`:

```python
import json
import os
import pytest
import tempfile
from api.db.migrations.runner import run_migrations
from api.db.repos.push_repository import PushRepository


@pytest.fixture
def push_repo():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(tmp.name, migrations_dir)
    repo = PushRepository(db_path=tmp.name)
    yield repo
    os.unlink(tmp.name)


def test_save_and_get_subscription(push_repo):
    push_repo.save(
        player_id=123,
        endpoint="https://push.example.com/abc",
        p256dh="key123",
        auth="auth123",
        preferences={"loot_level4": True, "war_start": False},
    )
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1
    assert subs[0]["endpoint"] == "https://push.example.com/abc"
    prefs = json.loads(subs[0]["preferences"])
    assert prefs["loot_level4"] is True


def test_get_by_preference(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {"loot_level4": True, "war_start": True})
    push_repo.save(456, "https://push.example.com/b", "k2", "a2", {"loot_level4": False, "war_start": True})
    push_repo.save(789, "https://push.example.com/c", "k3", "a3", {"loot_level4": True, "war_start": False})

    loot_subs = push_repo.get_by_preference("loot_level4")
    assert len(loot_subs) == 2
    assert {s["player_id"] for s in loot_subs} == {123, 789}

    war_subs = push_repo.get_by_preference("war_start")
    assert len(war_subs) == 2
    assert {s["player_id"] for s in war_subs} == {123, 456}


def test_update_preferences(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {"loot_level4": True})
    push_repo.update_preferences(123, {"loot_level4": False, "war_start": True})
    subs = push_repo.get_by_player(123)
    prefs = json.loads(subs[0]["preferences"])
    assert prefs["loot_level4"] is False
    assert prefs["war_start"] is True


def test_delete_by_endpoint(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {})
    push_repo.delete_by_endpoint("https://push.example.com/a")
    assert push_repo.get_by_player(123) == []


def test_upsert_same_endpoint(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {"loot_level4": True})
    push_repo.save(123, "https://push.example.com/a", "k2", "a2", {"loot_level4": False})
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1
    assert subs[0]["p256dh"] == "k2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_push_repo.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Create migration `api/db/migrations/017_push_subscriptions.sql`**

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    preferences TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_player ON push_subscriptions(player_id);
```

- [ ] **Step 4: Create `api/db/repos/push_repository.py`**

```python
from __future__ import annotations
import json
import time
from api.db.repos.base import BaseRepository


class PushRepository(BaseRepository):
    def save(self, player_id: int, endpoint: str, p256dh: str, auth: str, preferences: dict) -> int:
        now = int(time.time())
        prefs_json = json.dumps(preferences)
        return self.mutate("""
            INSERT INTO push_subscriptions (player_id, endpoint, p256dh, auth, preferences, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
                player_id = excluded.player_id,
                p256dh = excluded.p256dh,
                auth = excluded.auth,
                preferences = excluded.preferences,
                updated_at = excluded.updated_at
        """, (player_id, endpoint, p256dh, auth, prefs_json, now, now))

    def get_by_player(self, player_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM push_subscriptions WHERE player_id = ?", (player_id,))
        return [dict(r) for r in rows]

    def get_by_preference(self, event_type: str) -> list[dict]:
        """Get all subscriptions where the given event preference is true."""
        rows = self.execute("SELECT * FROM push_subscriptions")
        result = []
        for r in rows:
            d = dict(r)
            try:
                prefs = json.loads(d.get("preferences", "{}"))
            except (json.JSONDecodeError, TypeError):
                prefs = {}
            if prefs.get(event_type):
                result.append(d)
        return result

    def get_by_player_and_preference(self, player_id: int, event_type: str) -> list[dict]:
        """Get subscriptions for a specific player where the event preference is true."""
        rows = self.execute(
            "SELECT * FROM push_subscriptions WHERE player_id = ?", (player_id,))
        result = []
        for r in rows:
            d = dict(r)
            try:
                prefs = json.loads(d.get("preferences", "{}"))
            except (json.JSONDecodeError, TypeError):
                prefs = {}
            if prefs.get(event_type):
                result.append(d)
        return result

    def update_preferences(self, player_id: int, preferences: dict) -> None:
        now = int(time.time())
        self.mutate("""
            UPDATE push_subscriptions SET preferences = ?, updated_at = ?
            WHERE player_id = ?
        """, (json.dumps(preferences), now, player_id))

    def delete_by_endpoint(self, endpoint: str) -> None:
        self.mutate("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_push_repo.py -v`
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/db/migrations/017_push_subscriptions.sql api/db/repos/push_repository.py tests/test_push_repo.py
git -c commit.gpgsign=false commit -m "feat: push_subscriptions table + PushRepository with preference filtering"
```

---

### Task 3: Create PushService for dispatching notifications

**Files:**
- Create: `api/push_service.py`
- Test: `tests/test_push_service.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_push_service.py`:

```python
import json
import pytest
from unittest.mock import MagicMock, patch


def test_dispatch_sends_to_matching_subscriptions():
    mock_repo = MagicMock()
    mock_repo.get_by_preference.return_value = [
        {"player_id": 123, "endpoint": "https://push.example.com/a", "p256dh": "k1", "auth": "a1", "preferences": '{"loot_level4": true}'},
        {"player_id": 456, "endpoint": "https://push.example.com/b", "p256dh": "k2", "auth": "a2", "preferences": '{"loot_level4": true}'},
    ]
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(
        push_repo=mock_repo,
        notification_repo=mock_notif_repo,
        vapid_private_key="test_key",
        vapid_claims={"sub": "mailto:test@example.com"},
    )

    with patch("api.push_service.webpush") as mock_wp:
        svc.dispatch("loot_level4", "NPC Loot!", "Duke reached Level 4", "/loot")

    assert mock_wp.call_count == 2
    # Also creates in-app notification
    mock_notif_repo.create.assert_called_once()


def test_dispatch_removes_expired_subscriptions():
    mock_repo = MagicMock()
    mock_repo.get_by_preference.return_value = [
        {"player_id": 123, "endpoint": "https://push.example.com/expired", "p256dh": "k1", "auth": "a1", "preferences": "{}"},
    ]
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(mock_repo, mock_notif_repo, "test_key", {"sub": "mailto:test@example.com"})

    from pywebpush import WebPushException
    with patch("api.push_service.webpush", side_effect=WebPushException("Gone", response=MagicMock(status_code=410))):
        svc.dispatch("loot_level4", "Test", "Test", "/test")

    mock_repo.delete_by_endpoint.assert_called_once_with("https://push.example.com/expired")


def test_dispatch_disabled_when_no_vapid_key():
    mock_repo = MagicMock()
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(mock_repo, mock_notif_repo, vapid_private_key=None, vapid_claims={})

    svc.dispatch("loot_level4", "Test", "Test", "/test")
    # Should still create in-app notification
    mock_notif_repo.create.assert_called_once()
    # But not call webpush
    mock_repo.get_by_preference.assert_not_called()


def test_dispatch_for_player_only():
    mock_repo = MagicMock()
    mock_repo.get_by_player_and_preference.return_value = [
        {"player_id": 123, "endpoint": "https://push.example.com/a", "p256dh": "k1", "auth": "a1", "preferences": '{"stakeout_change": true}'},
    ]
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(mock_repo, mock_notif_repo, "test_key", {"sub": "mailto:test@example.com"})

    with patch("api.push_service.webpush") as mock_wp:
        svc.dispatch_to_player(123, "stakeout_change", "Target Online", "Player X is online", "/stakeout")

    assert mock_wp.call_count == 1
    mock_repo.get_by_player_and_preference.assert_called_once_with(123, "stakeout_change")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_push_service.py -v`
Expected: FAIL — no module `api.push_service`.

- [ ] **Step 3: Create `api/push_service.py`**

```python
from __future__ import annotations
import json
import logging
from pywebpush import webpush, WebPushException

logger = logging.getLogger("tm-hub.push")


class PushService:
    def __init__(self, push_repo, notification_repo, vapid_private_key: str | None, vapid_claims: dict):
        self._push_repo = push_repo
        self._notif_repo = notification_repo
        self._vapid_key = vapid_private_key
        self._vapid_claims = vapid_claims

    @property
    def enabled(self) -> bool:
        return self._vapid_key is not None

    def dispatch(self, event_type: str, title: str, body: str, url: str) -> int:
        """Send push to ALL subscribers with this event preference. Returns count sent."""
        # Always create in-app notification as fallback
        type_map = {"loot_level4": "loot", "war_start": "war", "stakeout_change": "stakeout", "oc_ready": "system"}
        if self._notif_repo:
            self._notif_repo.create(
                type=type_map.get(event_type, "system"),
                title=title,
                message=body,
                data={"event_type": event_type, "url": url},
            )

        if not self.enabled:
            return 0

        subs = self._push_repo.get_by_preference(event_type)
        return self._send_to_subs(subs, title, body, url)

    def dispatch_to_player(self, player_id: int, event_type: str, title: str, body: str, url: str) -> int:
        """Send push to a specific player's subscriptions matching this event. Returns count sent."""
        if self._notif_repo:
            type_map = {"loot_level4": "loot", "war_start": "war", "stakeout_change": "stakeout", "oc_ready": "system"}
            self._notif_repo.create(
                type=type_map.get(event_type, "system"),
                title=title,
                message=body,
                data={"event_type": event_type, "url": url, "player_id": player_id},
            )

        if not self.enabled:
            return 0

        subs = self._push_repo.get_by_player_and_preference(player_id, event_type)
        return self._send_to_subs(subs, title, body, url)

    def _send_to_subs(self, subs: list[dict], title: str, body: str, url: str) -> int:
        payload = json.dumps({"title": title, "body": body, "icon": "/icon-192.png", "url": url})
        sent = 0
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=self._vapid_key,
                    vapid_claims=self._vapid_claims,
                )
                sent += 1
            except WebPushException as e:
                if hasattr(e, 'response') and e.response is not None and e.response.status_code == 410:
                    logger.info("Removing expired push subscription: %s", sub["endpoint"][:50])
                    self._push_repo.delete_by_endpoint(sub["endpoint"])
                else:
                    logger.warning("Push failed for %s: %s", sub["endpoint"][:50], e)
            except Exception as e:
                logger.warning("Push error for %s: %s", sub["endpoint"][:50], e)
        return sent
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_push_service.py -v`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/push_service.py tests/test_push_service.py
git -c commit.gpgsign=false commit -m "feat: PushService — dispatch Web Push with graceful fallback to in-app"
```

---

### Task 4: Create push router and wire into main.py

**Files:**
- Create: `api/routers/push.py`
- Modify: `api/main.py`
- Modify: `api/config.py` (add VAPID env vars)
- Test: `tests/test_routes.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_push_vapid_key():
    with patch("api.main.torn_client", MagicMock()), \
         patch("api.main.key_store", MagicMock()):
        import api.routers.push as push_mod
        push_mod.vapid_public_key = "test_public_key_base64"
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/push/vapid-key")
    assert resp.status_code == 200
    assert resp.json()["vapid_public_key"] == "test_public_key_base64"


@pytest.mark.asyncio
async def test_push_subscribe(mock_client, mock_store):
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.push as push_mod
        mock_push_repo = MagicMock()
        push_mod.push_repo = mock_push_repo
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/push/subscribe", json={
                "endpoint": "https://push.example.com/abc",
                "keys": {"p256dh": "key123", "auth": "auth123"},
                "preferences": {"loot_level4": True, "war_start": True},
            }, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    mock_push_repo.save.assert_called_once_with(
        player_id=123,
        endpoint="https://push.example.com/abc",
        p256dh="key123",
        auth="auth123",
        preferences={"loot_level4": True, "war_start": True},
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_routes.py::test_push_vapid_key -v`
Expected: FAIL — no module `api.routers.push`.

- [ ] **Step 3: Add VAPID env vars to `api/config.py`**

Read `api/config.py` first, then add:

```python
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_MAILTO = os.environ.get("VAPID_MAILTO", "mailto:admin@tri.ovh")
```

- [ ] **Step 4: Create `api/routers/push.py`**

```python
from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

logger = logging.getLogger("tm-hub.push")

router = APIRouter(prefix="/api/push", tags=["push"])
push_repo = None       # Set by main.py
push_service = None    # Set by main.py
vapid_public_key = None  # Set by main.py


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}
    preferences: dict = {}


class PreferencesRequest(BaseModel):
    preferences: dict


@router.get("/vapid-key")
async def get_vapid_key():
    return {"vapid_public_key": vapid_public_key, "enabled": vapid_public_key is not None}


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest, x_player_id: int = Header()):
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.save(
        player_id=x_player_id,
        endpoint=req.endpoint,
        p256dh=req.keys.get("p256dh", ""),
        auth=req.keys.get("auth", ""),
        preferences=req.preferences,
    )
    return {"status": "subscribed"}


@router.put("/preferences")
async def update_preferences(req: PreferencesRequest, x_player_id: int = Header()):
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.update_preferences(x_player_id, req.preferences)
    return {"status": "updated"}


@router.delete("/unsubscribe")
async def unsubscribe(endpoint: str, x_player_id: int = Header()):
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.delete_by_endpoint(endpoint)
    return {"status": "unsubscribed"}
```

- [ ] **Step 5: Register in `api/main.py`**

Add imports after the company imports:

```python
from api.routers.push import router as push_router
import api.routers.push as push_mod
```

In the lifespan function, after `company_mod.key_store = key_store`, add:

```python
    from api.db.repos.push_repository import PushRepository
    push_repo = PushRepository(db_path="data/keys.db")
    push_mod.push_repo = push_repo
    push_mod.vapid_public_key = VAPID_PUBLIC_KEY

    from api.push_service import PushService
    from api.config import VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_MAILTO
    push_service = PushService(
        push_repo=push_repo,
        notification_repo=notification_repo,
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={"sub": VAPID_MAILTO} if VAPID_PRIVATE_KEY else {},
    )
    push_mod.push_service = push_service
```

Also pass `push_service` to the scheduler state dict:

```python
    app_scheduler = await create_and_start_scheduler({
        ...existing keys...,
        "push_service": push_service,
    })
```

After `app.include_router(company_router)`, add:

```python
app.include_router(push_router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest tests/test_routes.py::test_push_vapid_key tests/test_routes.py::test_push_subscribe -v`
Expected: Both PASS.

- [ ] **Step 7: Commit**

```bash
git add api/config.py api/routers/push.py api/main.py tests/test_routes.py
git -c commit.gpgsign=false commit -m "feat: push notification router — subscribe, preferences, VAPID key endpoint"
```

---

### Task 5: Hook push triggers into refresh_data scheduler job

**Files:**
- Modify: `api/scheduler/jobs/refresh_data.py`
- Test: `tests/test_scheduler_jobs.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_scheduler_jobs.py`:

```python
@pytest.mark.asyncio
async def test_loot_level4_triggers_push():
    """When an NPC crosses from level <4 to >=4, push notification is dispatched."""
    from api.scheduler.jobs.refresh_data import _prev_npc_levels
    _prev_npc_levels.clear()
    _prev_npc_levels[4] = 3  # Duke was level 3

    mock_push = MagicMock()
    mock_push.dispatch = MagicMock()

    # Simulate crossing to level 4
    from api.scheduler.jobs.refresh_data import _check_loot_push
    _check_loot_push(
        npcs=[{"id": 4, "name": "Duke", "level": 4}],
        push_service=mock_push,
    )

    mock_push.dispatch.assert_called_once()
    args = mock_push.dispatch.call_args
    assert args[0][0] == "loot_level4"
    assert "Duke" in args[0][1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_scheduler_jobs.py::test_loot_level4_triggers_push -v`
Expected: FAIL — `_prev_npc_levels` and `_check_loot_push` don't exist.

- [ ] **Step 3: Add push trigger logic to `api/scheduler/jobs/refresh_data.py`**

Add at module level (after the existing globals):

```python
# Track NPC levels between cycles for push notification triggers
_prev_npc_levels: dict[int, int] = {}


def _check_loot_push(npcs: list[dict], push_service) -> None:
    """Check if any NPC crossed from <4 to >=4 and send push notifications."""
    global _prev_npc_levels
    if not push_service:
        return
    for npc in npcs:
        npc_id = npc.get("id", 0)
        level = npc.get("level", 0)
        name = npc.get("name", f"NPC #{npc_id}")
        prev = _prev_npc_levels.get(npc_id, 0)
        if prev < 4 and level >= 4:
            push_service.dispatch(
                "loot_level4",
                f"{name} — Loot Level {level}!",
                f"{name} reached Level {level}. Time to attack for high-value loot!",
                "/loot",
            )
        _prev_npc_levels[npc_id] = level
```

In the existing NPC loot section (around line 170-201), after the `npcs` list is built and `loot_mod._cache_ts = 0`, add:

```python
                push_svc = state.get("push_service")
                if push_svc and npcs:
                    npc_parsed = []
                    for key2, val2 in raw.items():
                        if key2 in ("status", "message", "loot") or not isinstance(val2, dict):
                            continue
                        try:
                            npc_parsed.append({"id": int(key2), "name": val2.get("name", ""), "level": val2.get("level", 0)})
                        except ValueError:
                            pass
                    _check_loot_push(npc_parsed, push_svc)
```

- [ ] **Step 4: Add war start push trigger**

In the existing war state change section (around lines 44-52), after the existing `notif_repo.create("war", ...)` call, add:

```python
                push_svc = state.get("push_service")
                if push_svc and war_active:
                    push_svc.dispatch("war_start", "War Started!", "An active war has been detected. Get ready for battle!", "/wars")
```

- [ ] **Step 5: Add stakeout push trigger**

In the existing stakeout change section (around line 233-243), after the existing `notif_repo.create(type="stakeout", ...)` call, add:

```python
                                    push_svc = state.get("push_service")
                                    if push_svc:
                                        push_svc.dispatch_to_player(
                                            w.get("added_by", 0),
                                            "stakeout_change",
                                            f"{pname} is now {status_desc}",
                                            f"Stakeout alert: {pname} changed status",
                                            "/stakeout",
                                        )
```

The stakeout table has an `added_by` column tracking who created the stakeout.

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_scheduler_jobs.py::test_loot_level4_triggers_push -v`
Expected: PASS

- [ ] **Step 7: Run full backend test suite**

Run: `uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add api/scheduler/jobs/refresh_data.py tests/test_scheduler_jobs.py
git -c commit.gpgsign=false commit -m "feat: push notification triggers for loot level 4+, war start, stakeout changes"
```

---

### Task 6: Create Service Worker

**Files:**
- Create: `frontend/public/sw.js`

- [ ] **Step 1: Create `frontend/public/sw.js`**

```javascript
/* Service Worker for TM Hub push notifications */

self.addEventListener('push', function(event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'TM Hub', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/' },
    vibrate: [200, 100, 200],
    tag: payload.tag || 'tm-hub-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'TM Hub', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url === fullUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(fullUrl);
    })
  );
});
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds (sw.js is a static file in public/).

- [ ] **Step 3: Commit**

```bash
git add frontend/public/sw.js
git -c commit.gpgsign=false commit -m "feat: Service Worker for push notification display and click handling"
```

---

### Task 7: Create usePushNotifications hook

**Files:**
- Create: `frontend/src/hooks/usePushNotifications.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/usePushNotifications.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';

// Add these to api-client.ts first (done in step 2)

export type PushEvent = 'loot_level4' | 'war_start' | 'stakeout_change' | 'oc_ready';

export interface PushPreferences {
  loot_level4: boolean;
  war_start: boolean;
  stakeout_change: boolean;
  oc_ready: boolean;
}

const DEFAULT_PREFERENCES: PushPreferences = {
  loot_level4: true,
  war_start: true,
  stakeout_change: true,
  oc_ready: true,
};

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PREFERENCES);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check current permission state
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);
  }, []);

  // Fetch VAPID key and current subscription status
  useEffect(() => {
    api.pushVapidKey()
      .then(d => {
        const data = d as { vapid_public_key: string | null; enabled: boolean };
        setVapidKey(data.vapid_public_key);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Check if already subscribed
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub);
      });
    }).catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidKey || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Request notification permission
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') return;

    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Subscribe to push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const subJson = sub.toJSON();

    // Send to backend
    await api.pushSubscribe({
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh || '',
        auth: subJson.keys?.auth || '',
      },
      preferences: DEFAULT_PREFERENCES,
    });

    setSubscribed(true);
    setPreferences(DEFAULT_PREFERENCES);
  }, [vapidKey]);

  const unsubscribe = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.pushUnsubscribe(sub.endpoint);
      await sub.unsubscribe();
    }
    setSubscribed(false);
  }, []);

  const updatePreferences = useCallback(async (newPrefs: PushPreferences) => {
    setPreferences(newPrefs);
    await api.pushPreferences(newPrefs);
  }, []);

  const sendTest = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('TM Hub Test', {
      body: 'Push notifications are working!',
      icon: '/icon-192.png',
    });
  }, []);

  return {
    permission,
    subscribed,
    preferences,
    vapidKey,
    loading,
    supported: typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator,
    subscribe,
    unsubscribe,
    updatePreferences,
    sendTest,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
```

- [ ] **Step 2: Add push API methods to api-client.ts**

In `frontend/src/lib/api-client.ts`, add to the api object:

```typescript
  pushVapidKey: () => apiFetch<{ vapid_public_key: string | null; enabled: boolean }>('/api/push/vapid-key'),
  pushSubscribe: (data: { endpoint: string; keys: { p256dh: string; auth: string }; preferences: Record<string, boolean> }) =>
    apiFetch<unknown>('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  pushPreferences: (prefs: Record<string, boolean>) =>
    apiFetch<unknown>('/api/push/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: prefs }) }),
  pushUnsubscribe: (endpoint: string) =>
    apiFetch<unknown>(`/api/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' }),
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/usePushNotifications.ts frontend/src/lib/api-client.ts
git -c commit.gpgsign=false commit -m "feat: usePushNotifications hook + push API client methods"
```

---

### Task 8: Add push settings UI to notifications page

**Files:**
- Modify: `frontend/src/app/notifications/page.tsx`

- [ ] **Step 1: Add push notification settings section**

In `frontend/src/app/notifications/page.tsx`, add the import at the top:

```typescript
import { usePushNotifications, PushPreferences } from '@/hooks/usePushNotifications';
```

Inside the `NotificationsPage` component (after existing state declarations), add:

```typescript
  const push = usePushNotifications();
```

After the header `div` (after the RefreshButton section, before the loading check), add the push settings section:

```tsx
        {/* Push Notification Settings */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Push Notifications</h2>
              <p className="text-[10px] text-text-muted mt-0.5">Get alerts even when the app is closed.</p>
            </div>
            <div className="flex items-center gap-2">
              {push.permission === 'granted' && push.subscribed ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Enabled</span>
              ) : push.permission === 'denied' ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-red/15 text-torn-red font-medium">Blocked</span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-yellow/15 text-torn-yellow font-medium">Disabled</span>
              )}
            </div>
          </div>

          {!push.supported ? (
            <p className="text-xs text-text-muted">Push notifications are not supported in this browser.</p>
          ) : push.permission === 'denied' ? (
            <div className="bg-torn-red/5 border border-torn-red/20 rounded-lg p-3 text-xs text-text-secondary">
              <p className="font-medium text-torn-red mb-1">Notifications blocked</p>
              <p>You previously denied notification permission. To re-enable: click the lock icon in your browser&apos;s address bar → Notifications → Allow.</p>
            </div>
          ) : !push.subscribed ? (
            <button onClick={push.subscribe}
              className="px-4 py-2 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
              Enable Push Notifications
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
                { key: 'oc_ready' as const, label: 'OC Ready', desc: 'When organized crime is ready to initiate' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={push.preferences[key]}
                    onChange={() => {
                      const newPrefs: PushPreferences = { ...push.preferences, [key]: !push.preferences[key] };
                      push.updatePreferences(newPrefs);
                    }}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50"
                  />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}

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
            </div>
          )}
        </div>
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/notifications/page.tsx
git -c commit.gpgsign=false commit -m "feat: push notification settings UI — enable/disable, per-event toggles, test button"
```

---

### Task 9: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass (213+ existing + ~12 new push tests).

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Static export succeeds.

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 4: Commit any fixes if needed**
