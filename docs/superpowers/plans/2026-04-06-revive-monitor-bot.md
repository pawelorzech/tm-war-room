# Revive Monitor Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a chat bot that warns faction members who have revives enabled — a liability during wars.

**Architecture:** Dedicated `api/bots/revive_monitor.py` module with `run()` function called by both a scheduler job (every 10 min with internal throttle) and an admin trigger endpoint. Posts to a "revives" chat channel using the existing bot/chat/mention/push infrastructure. Frontend gets a new "Bots" admin tab.

**Tech Stack:** FastAPI, APScheduler 4.x, SQLite (existing chat tables), React/Next.js 15, Tailwind v4

---

### Task 1: Add `get_bot_by_name` to ChatRepository

**Files:**
- Modify: `api/db/repos/chat.py:318` (bot section)
- Test: `tests/test_revive_monitor.py` (new file)

- [ ] **Step 1: Create test file with first test**

```python
# tests/test_revive_monitor.py
import pytest
from unittest.mock import MagicMock, AsyncMock

from api.models import FactionMember, LastAction, MemberStatus


def _make_member(
    id: int = 1, name: str = "Player1",
    revive_setting: str = "No one",
) -> FactionMember:
    return FactionMember(
        id=id, name=name, level=50, days_in_faction=100,
        last_action=LastAction(status="Online", timestamp=1774600000, relative="1 min ago"),
        status=MemberStatus(description="Okay", details=None, state="Okay", color="green", until=None),
        position="Team 1", is_on_wall=False, is_revivable=False, is_in_oc=False,
        revive_setting=revive_setting,
    )
```

- [ ] **Step 2: Run test to verify file is valid**

Run: `uv run pytest tests/test_revive_monitor.py -v`
Expected: "no tests ran" (0 collected), no import errors

- [ ] **Step 3: Add `get_bot_by_name` method to ChatRepository**

In `api/db/repos/chat.py`, add after `get_bot_by_token`:

```python
def get_bot_by_name(self, name: str) -> dict | None:
    row = self.execute_one(
        "SELECT * FROM chat_bots WHERE name = ?", (name,)
    )
    return dict(row) if row else None
```

- [ ] **Step 4: Commit**

```bash
git add api/db/repos/chat.py tests/test_revive_monitor.py
git commit -m "feat: add get_bot_by_name to ChatRepository + test scaffold"
```

---

### Task 2: Implement `revive_monitor.run()` core logic

**Files:**
- Create: `api/bots/__init__.py`
- Create: `api/bots/revive_monitor.py`
- Modify: `tests/test_revive_monitor.py`

- [ ] **Step 1: Write failing tests for revive_monitor.run()**

Add to `tests/test_revive_monitor.py`:

```python
from api.bots.revive_monitor import run, _filter_revive_enabled, _format_message


class TestFilterReviveEnabled:
    def test_filters_out_no_one(self):
        members = [
            _make_member(id=1, name="Safe", revive_setting="No one"),
            _make_member(id=2, name="Risky", revive_setting="Everyone"),
        ]
        result = _filter_revive_enabled(members)
        assert len(result) == 1
        assert result[0].id == 2

    def test_catches_friends_and_faction(self):
        members = [_make_member(id=1, revive_setting="Friends & faction")]
        result = _filter_revive_enabled(members)
        assert len(result) == 1

    def test_catches_unknown(self):
        members = [_make_member(id=1, revive_setting="Unknown")]
        result = _filter_revive_enabled(members)
        assert len(result) == 1

    def test_empty_when_all_safe(self):
        members = [
            _make_member(id=1, revive_setting="No one"),
            _make_member(id=2, revive_setting="No one"),
        ]
        result = _filter_revive_enabled(members)
        assert len(result) == 0


class TestFormatMessage:
    def test_war_mode_urgent(self):
        members = [_make_member(id=1, name="Risky", revive_setting="Everyone")]
        msg = _format_message(members, war_active=True)
        assert "UWAGA" in msg
        assert "@Risky" in msg

    def test_peace_mode_gentle(self):
        members = [_make_member(id=1, name="Risky", revive_setting="Everyone")]
        msg = _format_message(members, war_active=False)
        assert "Przypomnienie" in msg
        assert "@Risky" in msg

    def test_empty_list_all_clear(self):
        msg = _format_message([], war_active=False)
        assert "Wszystko OK" in msg

    def test_empty_list_war_all_clear(self):
        msg = _format_message([], war_active=True)
        assert "Wszystko OK" in msg

    def test_shows_revive_setting(self):
        members = [_make_member(id=1, name="P1", revive_setting="Friends & faction")]
        msg = _format_message(members, war_active=True)
        assert "Friends & faction" in msg

    def test_multiple_members(self):
        members = [
            _make_member(id=1, name="P1", revive_setting="Everyone"),
            _make_member(id=2, name="P2", revive_setting="Friends & faction"),
        ]
        msg = _format_message(members, war_active=False)
        assert "@P1" in msg
        assert "@P2" in msg
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_revive_monitor.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.bots'`

- [ ] **Step 3: Implement the module**

Create `api/bots/__init__.py`:

```python
```

Create `api/bots/revive_monitor.py`:

```python
from __future__ import annotations

import logging
import time

from api.models import FactionMember

logger = logging.getLogger("tm-hub.bots.revive")

BOT_NAME = "Revive Monitor"
CHANNEL_NAME = "revives"

# Throttle state
_last_post_ts: float = 0.0
PEACE_INTERVAL = 3600  # 60 minutes

# Injected by main.py during startup
_notify_mentions_fn = None


async def _noop_notify(*args, **kwargs):
    pass


def _filter_revive_enabled(members: list[FactionMember]) -> list[FactionMember]:
    """Return members whose revive_setting is NOT 'No one'."""
    return [m for m in members if m.revive_setting != "No one"]


def _format_message(risky_members: list[FactionMember], war_active: bool) -> str:
    """Format the bot message based on war state and member list."""
    if not risky_members:
        return "\u2705 Wszystko OK \u2014 nikt nie ma w\u0142\u0105czonych revives."

    lines = []
    for m in risky_members:
        lines.append(f"\u2022 @{m.name} ({m.revive_setting})")
    member_list = "\n".join(lines)

    if war_active:
        return (
            "\u26a0\ufe0f **UWAGA! Trwa wojna!**\n\n"
            "Nast\u0119puj\u0105cy gracze maj\u0105 w\u0142\u0105czone revives \u2014 "
            "wy\u0142\u0105czcie je natychmiast!\n"
            "Wr\u00f3g mo\u017ce was wskrzesza\u0107 i zabija\u0107 dla punkt\u00f3w.\n\n"
            f"{member_list}\n\n"
            "\ud83d\udc49 Torn \u2192 Settings \u2192 Revive \u2192 \"No one\""
        )
    else:
        return (
            "\ud83d\udccb Przypomnienie o revives\n\n"
            "Poni\u017csi gracze maj\u0105 w\u0142\u0105czone revives. "
            "Warto wy\u0142\u0105czy\u0107 przed kolejn\u0105 wojn\u0105:\n\n"
            f"{member_list}\n\n"
            "\ud83d\udc49 Torn \u2192 Settings \u2192 Revive \u2192 \"No one\""
        )


async def run(
    torn_client,
    chat_repo,
    chat_manager,
    war_active: bool,
    force: bool = False,
) -> dict:
    """
    Check faction members for enabled revives and post warning to chat.

    Args:
        torn_client: TornClient instance for fetching members
        chat_repo: ChatRepository for posting messages
        chat_manager: ChatManager for WebSocket broadcast
        war_active: Whether a war is currently active
        force: If True, bypass throttle (for admin trigger)

    Returns:
        dict with keys: posted (bool), risky_count (int), message (str)
    """
    global _last_post_ts

    # Throttle check (skip during war or when forced)
    now = time.time()
    if not force and not war_active:
        if now - _last_post_ts < PEACE_INTERVAL:
            return {"posted": False, "risky_count": -1, "message": "Throttled (peacetime)"}

    # Get bot and channel
    bot = chat_repo.get_bot_by_name(BOT_NAME)
    if not bot or not bot.get("active", 1):
        return {"posted": False, "risky_count": -1, "message": "Bot not found or inactive"}

    channel = chat_repo.get_channel_by_name(CHANNEL_NAME)
    if not channel:
        return {"posted": False, "risky_count": -1, "message": "Channel not found"}

    # Fetch members and filter
    members = await torn_client.fetch_members()
    risky = _filter_revive_enabled(members)
    content = _format_message(risky, war_active)
    mentions = [m.id for m in risky]

    # Post message
    msg = chat_repo.create_message(
        channel_id=channel["id"],
        player_id=0,
        player_name=bot["name"],
        content=content,
        bot_id=bot["id"],
        mentions=mentions,
    )
    if chat_manager:
        await chat_manager.broadcast({"type": "message", "payload": msg})

    # Notify mentions (push notifications)
    notify = _notify_mentions_fn or _noop_notify
    await notify(mentions, bot["name"], content, channel["id"])

    _last_post_ts = now
    logger.info("Revive monitor posted: %d risky members, war=%s", len(risky), war_active)

    return {"posted": True, "risky_count": len(risky), "message": content}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_revive_monitor.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add api/bots/__init__.py api/bots/revive_monitor.py tests/test_revive_monitor.py
git commit -m "feat: implement revive_monitor core logic with filter and format"
```

---

### Task 3: Test the `run()` function end-to-end

**Files:**
- Modify: `tests/test_revive_monitor.py`

- [ ] **Step 1: Write integration-style tests for run()**

Add to `tests/test_revive_monitor.py`:

```python
import time
from unittest.mock import patch

import api.bots.revive_monitor as revive_mod


@pytest.fixture
def mock_chat_repo():
    repo = MagicMock()
    repo.get_bot_by_name.return_value = {
        "id": 1, "name": "Revive Monitor", "active": 1,
        "token": "fake", "allowed_channels": "*",
    }
    repo.get_channel_by_name.return_value = {"id": 10, "name": "revives"}
    repo.create_message.return_value = {
        "id": 100, "channel_id": 10, "thread_id": None,
        "player_id": 0, "player_name": "Revive Monitor",
        "content": "test", "bot_id": 1, "mentions": [],
        "pinned": 0, "deleted": 0, "created_at": 1000, "edited_at": None,
    }
    return repo


@pytest.fixture
def mock_torn_client_for_bot():
    client = AsyncMock()
    client.fetch_members = AsyncMock(return_value=[
        _make_member(id=1, name="Safe", revive_setting="No one"),
        _make_member(id=2, name="Risky", revive_setting="Everyone"),
        _make_member(id=3, name="AlsoRisky", revive_setting="Friends & faction"),
    ])
    return client


@pytest.fixture
def mock_chat_manager():
    mgr = AsyncMock()
    mgr.broadcast = AsyncMock()
    return mgr


class TestRun:
    @pytest.mark.asyncio
    async def test_posts_message_with_risky_members(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        revive_mod._last_post_ts = 0.0
        with patch("api.bots.revive_monitor._notify_mentions_fn", new_callable=AsyncMock) as mock_notify:
            result = await run(
                torn_client=mock_torn_client_for_bot,
                chat_repo=mock_chat_repo,
                chat_manager=mock_chat_manager,
                war_active=True,
                force=True,
            )
        assert result["posted"] is True
        assert result["risky_count"] == 2
        mock_chat_repo.create_message.assert_called_once()
        call_kwargs = mock_chat_repo.create_message.call_args
        assert call_kwargs.kwargs["mentions"] == [2, 3]

    @pytest.mark.asyncio
    async def test_throttled_in_peacetime(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        revive_mod._last_post_ts = time.time()  # just posted
        result = await run(
            torn_client=mock_torn_client_for_bot,
            chat_repo=mock_chat_repo,
            chat_manager=mock_chat_manager,
            war_active=False,
            force=False,
        )
        assert result["posted"] is False
        assert "Throttled" in result["message"]

    @pytest.mark.asyncio
    async def test_not_throttled_during_war(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        revive_mod._last_post_ts = time.time()  # just posted
        with patch("api.bots.revive_monitor._notify_mentions_fn", new_callable=AsyncMock):
            result = await run(
                torn_client=mock_torn_client_for_bot,
                chat_repo=mock_chat_repo,
                chat_manager=mock_chat_manager,
                war_active=True,
                force=False,
            )
        assert result["posted"] is True

    @pytest.mark.asyncio
    async def test_force_bypasses_throttle(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        revive_mod._last_post_ts = time.time()
        with patch("api.bots.revive_monitor._notify_mentions_fn", new_callable=AsyncMock):
            result = await run(
                torn_client=mock_torn_client_for_bot,
                chat_repo=mock_chat_repo,
                chat_manager=mock_chat_manager,
                war_active=False,
                force=True,
            )
        assert result["posted"] is True

    @pytest.mark.asyncio
    async def test_inactive_bot_skips(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        mock_chat_repo.get_bot_by_name.return_value = {
            "id": 1, "name": "Revive Monitor", "active": 0,
        }
        revive_mod._last_post_ts = 0.0
        result = await run(
            torn_client=mock_torn_client_for_bot,
            chat_repo=mock_chat_repo,
            chat_manager=mock_chat_manager,
            war_active=True,
            force=True,
        )
        assert result["posted"] is False
        assert "inactive" in result["message"]

    @pytest.mark.asyncio
    async def test_missing_channel_skips(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        mock_chat_repo.get_channel_by_name.return_value = None
        revive_mod._last_post_ts = 0.0
        result = await run(
            torn_client=mock_torn_client_for_bot,
            chat_repo=mock_chat_repo,
            chat_manager=mock_chat_manager,
            war_active=True,
            force=True,
        )
        assert result["posted"] is False
        assert "Channel not found" in result["message"]
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `uv run pytest tests/test_revive_monitor.py -v`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/test_revive_monitor.py
git commit -m "test: add run() integration tests for revive monitor"
```

---

### Task 4: Create the scheduler job

**Files:**
- Create: `api/scheduler/jobs/revive_check.py`
- Modify: `api/scheduler/engine.py`

- [ ] **Step 1: Create the scheduler job**

Create `api/scheduler/jobs/revive_check.py`:

```python
from __future__ import annotations

import logging

logger = logging.getLogger("tm-hub.scheduler.revive")


async def run_revive_check() -> None:
    """Scheduler entry point for revive monitor. Runs every 10 minutes."""
    from api.scheduler.engine import get_state
    from api.scheduler.jobs.refresh_data import war_active
    from api.bots.revive_monitor import run

    state = get_state()
    torn_client = state.get("torn_client")
    chat_repo = state.get("chat_repo")
    chat_manager = state.get("chat_manager")

    if not torn_client or not chat_repo:
        logger.warning("Revive check skipped: dependencies not ready")
        return

    result = await run(
        torn_client=torn_client,
        chat_repo=chat_repo,
        chat_manager=chat_manager,
        war_active=war_active,
    )
    if result["posted"]:
        logger.info("Revive check: posted (%d risky members)", result["risky_count"])
    else:
        logger.debug("Revive check: %s", result["message"])
```

- [ ] **Step 2: Register the job in engine.py**

In `api/scheduler/engine.py`, add the import:

```python
from api.scheduler.jobs.revive_check import run_revive_check
```

Add after the `collect_circulation` configure+schedule block:

```python
await scheduler.configure_task("revive_check", func=run_revive_check)
await scheduler.add_schedule(
    "revive_check",
    IntervalTrigger(minutes=10),
    id="revive_check_schedule",
)
```

Update the log message:

```python
logger.info("Scheduler started: collect_stats (15min), circulation (15min), refresh_spies (30min), refresh_data (30s), revive_check (10min)")
```

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `uv run pytest tests/ -v`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add api/scheduler/jobs/revive_check.py api/scheduler/engine.py
git commit -m "feat: add revive_check scheduler job (every 10 min)"
```

---

### Task 5: Auto-provision bot and channel on startup

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Add auto-provisioning in lifespan**

In `api/main.py`, add after the `chat_mod.settings_repo = settings_repo` line (line 191) and before the scheduler section:

```python
# Auto-provision Revive Monitor bot and channel
from api.bots import revive_monitor as revive_bot_mod
_revive_channel = chat_repo.get_channel_by_name("revives")
if not _revive_channel:
    _revive_ch_id = chat_repo.create_channel(
        name="revives", description="Revive status warnings from the bot",
        ch_type="chat", position=99, admin_only=False, created_by=SUPERADMIN_ID,
    )
    logger.info("Auto-created 'revives' chat channel (id=%d)", _revive_ch_id)
    _revive_channel = chat_repo.get_channel(_revive_ch_id)

_revive_bot = chat_repo.get_bot_by_name("Revive Monitor")
if not _revive_bot:
    import uuid as _uuid
    _bot_token = str(_uuid.uuid4())
    _bot_id = chat_repo.create_bot(
        name="Revive Monitor", token=_bot_token,
        allowed_channels=json.dumps([_revive_channel["id"]]),
        created_by=SUPERADMIN_ID,
    )
    logger.info("Auto-created 'Revive Monitor' bot (id=%d)", _bot_id)

# Wire up revive_monitor notify function
from api.routers.chat import _notify_mentions
revive_bot_mod._notify_mentions_fn = _notify_mentions
```

Also add `import json` at the top of `main.py` if not already present.

- [ ] **Step 2: Pass chat_repo and chat_manager to scheduler state**

In the `create_and_start_scheduler` call in `main.py`, add to the state dict:

```python
"chat_repo": chat_repo,
"chat_manager": chat_mgr,
```

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `uv run pytest tests/ -v`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add api/main.py
git commit -m "feat: auto-provision revive monitor bot and channel on startup"
```

---

### Task 6: Add admin trigger endpoint

**Files:**
- Modify: `api/admin.py`
- Modify: `tests/test_revive_monitor.py`

- [ ] **Step 1: Write a test for the admin trigger endpoint**

Add to `tests/test_revive_monitor.py`:

```python
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_admin_trigger_bot(mock_torn_client_for_bot):
    """Test the admin bot trigger endpoint."""
    mock_store = MagicMock()
    mock_store.get_all_keys.return_value = [
        {"player_id": 2362436, "player_name": "Bombel", "api_key": "fake", "is_faction_key": False},
    ]
    mock_store.is_admin.return_value = True
    mock_store._keys = mock_store

    mock_chat_repo = MagicMock()
    mock_chat_repo.get_bot_by_name.return_value = {
        "id": 1, "name": "Revive Monitor", "active": 1,
    }
    mock_chat_repo.get_channel_by_name.return_value = {"id": 10, "name": "revives"}
    mock_chat_repo.create_message.return_value = {
        "id": 100, "channel_id": 10, "thread_id": None,
        "player_id": 0, "player_name": "Revive Monitor",
        "content": "test", "bot_id": 1, "mentions": [],
        "pinned": 0, "deleted": 0, "created_at": 1000, "edited_at": None,
    }

    with (
        patch("api.main.torn_client", mock_torn_client_for_bot),
        patch("api.main.key_store", mock_store),
        patch("api.admin._key_store", mock_store),
        patch("api.admin._torn_client", mock_torn_client_for_bot),
        patch("api.admin._app_start_time", 1000.0),
        patch("api.admin._chat_repo", mock_chat_repo),
        patch("api.admin._chat_manager", AsyncMock()),
        patch("api.auth.decode_jwt", return_value={"sub": 2362436, "name": "Bombel"}),
        patch("api.bots.revive_monitor._notify_mentions_fn", new_callable=AsyncMock),
    ):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/admin/bots/trigger/revive-monitor",
                headers={"Authorization": "Bearer fake-token"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert "risky_count" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_revive_monitor.py::test_admin_trigger_bot -v`
Expected: FAIL (endpoint doesn't exist yet)

- [ ] **Step 3: Add the trigger endpoint to admin.py**

In `api/admin.py`, add module-level state variables:

```python
_chat_repo = None
_chat_manager = None
```

Add to the `init()` function signature and body — actually, it's cleaner to add a separate init. Add after the existing `init()`:

```python
def init_bots(chat_repo, chat_manager) -> None:
    global _chat_repo, _chat_manager
    _chat_repo = chat_repo
    _chat_manager = chat_manager
```

Add the endpoint at the end of the file:

```python
@router.post("/bots/trigger/revive-monitor")
async def trigger_revive_monitor(admin: dict = Depends(require_admin)):
    """Manually trigger the revive monitor bot."""
    if not _chat_repo:
        raise HTTPException(status_code=503, detail="Chat not initialized")
    from api.scheduler.jobs.refresh_data import war_active
    from api.bots.revive_monitor import run
    result = await run(
        torn_client=_torn_client,
        chat_repo=_chat_repo,
        chat_manager=_chat_manager,
        war_active=war_active,
        force=True,
    )
    logger.info("Revive monitor manually triggered by admin %d: %s", admin["sub"], result)
    return result
```

- [ ] **Step 4: Wire up init_bots in main.py**

In `api/main.py`, after the `admin_mod.init(...)` call, the `_chat_repo` and `_chat_manager` won't be ready yet. Instead, add after `chat_mod.settings_repo = settings_repo` (line 191):

```python
admin_mod.init_bots(chat_repo, chat_mgr)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_revive_monitor.py -v`
Expected: All tests PASS

Run: `uv run pytest tests/ -v`
Expected: All existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add api/admin.py api/main.py tests/test_revive_monitor.py
git commit -m "feat: add admin trigger endpoint for revive monitor bot"
```

---

### Task 7: Frontend — Bots admin tab

**Files:**
- Create: `frontend/src/components/admin/BotsAdmin.tsx`
- Modify: `frontend/src/app/admin/page.tsx`

- [ ] **Step 1: Create the BotsAdmin component**

Create `frontend/src/components/admin/BotsAdmin.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";

interface Bot {
  id: number;
  name: string;
  active: number;
  allowed_channels: string;
  created_by: number;
  created_at: number;
}

interface TriggerResult {
  posted: boolean;
  risky_count: number;
  message: string;
}

export function BotsAdmin({ adminFetch }: { adminFetch: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<TriggerResult | null>(null);

  const loadBots = useCallback(async () => {
    try {
      const res = await adminFetch("/api/chat/bots");
      if (res.ok) {
        const data = await res.json();
        setBots(data.bots || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => { loadBots(); }, [loadBots]);

  const triggerReviveMonitor = async () => {
    setTriggering(1);
    setLastResult(null);
    try {
      const res = await adminFetch("/api/admin/bots/trigger/revive-monitor", { method: "POST" });
      if (res.ok) {
        const data: TriggerResult = await res.json();
        setLastResult(data);
      }
    } catch {
      /* ignore */
    } finally {
      setTriggering(null);
    }
  };

  if (loading) return <div className="text-text-secondary">Loading bots...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Chat Bots</h2>

      {bots.length === 0 ? (
        <p className="text-text-secondary text-sm">No bots registered yet. They will be auto-created on next server restart.</p>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => (
            <div key={bot.id} className="bg-surface-secondary rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{bot.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      bot.active
                        ? "bg-torn-green/15 text-torn-green"
                        : "bg-torn-red/15 text-torn-red"
                    }`}>
                      {bot.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Created {new Date(bot.created_at * 1000).toLocaleDateString()}
                  </p>
                </div>

                {bot.name === "Revive Monitor" && (
                  <button
                    onClick={triggerReviveMonitor}
                    disabled={triggering !== null}
                    className="px-3 py-1.5 text-sm bg-torn-green/15 text-torn-green rounded-lg hover:bg-torn-green/25 transition-colors disabled:opacity-50"
                  >
                    {triggering ? "Checking..." : "Trigger Now"}
                  </button>
                )}
              </div>

              {bot.name === "Revive Monitor" && lastResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  lastResult.posted
                    ? lastResult.risky_count > 0
                      ? "bg-torn-red/10 text-torn-red"
                      : "bg-torn-green/10 text-torn-green"
                    : "bg-surface-primary text-text-secondary"
                }`}>
                  {lastResult.posted
                    ? lastResult.risky_count > 0
                      ? `Warning posted: ${lastResult.risky_count} member${lastResult.risky_count > 1 ? "s" : ""} with revives enabled`
                      : "All clear — no one has revives enabled"
                    : `Not posted: ${lastResult.message}`
                  }
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the Bots tab to the admin page**

In `frontend/src/app/admin/page.tsx`:

Add import:
```tsx
import { BotsAdmin } from "@/components/admin/BotsAdmin";
```

Update the `Tab` type:
```tsx
type Tab = "analytics" | "announcements" | "spy" | "admins" | "settings" | "push" | "bots";
```

Add to the `tabs` array (before the `push` entry):
```tsx
{ id: "bots", label: "Bots", show: true },
```

Add to the render section:
```tsx
{tab === "bots" && <BotsAdmin adminFetch={adminFetch} />}
```

- [ ] **Step 3: Build frontend to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds without errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/BotsAdmin.tsx frontend/src/app/admin/page.tsx
git commit -m "feat: add Bots admin tab with revive monitor trigger"
```

---

### Task 8: Update the admin `list_bots` endpoint to use admin auth

The current `/api/chat/bots` endpoint requires member auth via `X-Player-Id`, not admin JWT. The `BotsAdmin` component uses `adminFetch` which sends the JWT Bearer token. We need to ensure the bots list is accessible via admin auth.

**Files:**
- Modify: `api/admin.py`

- [ ] **Step 1: Add a bots list endpoint to admin router**

In `api/admin.py`, add:

```python
@router.get("/bots")
async def admin_list_bots(admin: dict = Depends(require_admin)):
    """List all chat bots for admin panel."""
    if not _chat_repo:
        raise HTTPException(status_code=503, detail="Chat not initialized")
    return {"bots": _chat_repo.get_bots()}
```

- [ ] **Step 2: Update BotsAdmin.tsx to use admin endpoint**

In `frontend/src/components/admin/BotsAdmin.tsx`, change the fetch URL:

```tsx
const res = await adminFetch("/api/admin/bots");
```

- [ ] **Step 3: Build and test**

Run: `cd frontend && npm run build`
Expected: Build succeeds

Run: `uv run pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add api/admin.py frontend/src/components/admin/BotsAdmin.tsx
git commit -m "feat: add admin-authed bots list endpoint"
```

---

### Task 9: Bump version and update changelog

**Files:**
- Modify: `frontend/src/data/changelog.ts`

- [ ] **Step 1: Read the current changelog to find the version and format**

Read `frontend/src/data/changelog.ts` to get `CURRENT_VERSION` and the `CHANGELOG` array format.

- [ ] **Step 2: Bump version and add entry**

Update `CURRENT_VERSION` to the next minor version (this is a new feature).

Add a new entry at the top of the `CHANGELOG` array:

```typescript
{
  version: "1.5.0",
  date: "2026-04-06",
  title: "Revive Monitor Bot",
  changes: [
    { type: "feat", text: "New chat bot that warns members with revives enabled — crucial during wars" },
    { type: "feat", text: "Bot posts automatically every 10 min (war) or 60 min (peace) to #revives channel" },
    { type: "feat", text: "New Bots tab in admin panel with manual trigger button" },
  ],
},
```

Note: Read the actual file first to confirm the current version number and adjust accordingly.

- [ ] **Step 3: Build frontend to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/data/changelog.ts
git commit -m "feat: bump version — revive monitor bot"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run all backend tests**

Run: `uv run pytest tests/ -v`
Expected: All tests PASS (including new revive monitor tests)

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Lint frontend**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 4: Review all changes**

Run: `git log --oneline master..HEAD` to see all commits.
Run: `git diff master --stat` to see files changed.

Verify:
- `api/bots/__init__.py` — empty init
- `api/bots/revive_monitor.py` — core logic
- `api/scheduler/jobs/revive_check.py` — scheduler job
- `api/scheduler/engine.py` — job registration
- `api/db/repos/chat.py` — `get_bot_by_name`
- `api/admin.py` — trigger endpoint + bots list
- `api/main.py` — auto-provisioning + wiring
- `frontend/src/components/admin/BotsAdmin.tsx` — new component
- `frontend/src/app/admin/page.tsx` — new tab
- `frontend/src/data/changelog.ts` — version bump
- `tests/test_revive_monitor.py` — tests
