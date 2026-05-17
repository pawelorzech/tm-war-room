"""Retaliation feed scheduler tests (Task #11)."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.scheduler.jobs import retal_feed
from api.config import FACTION_ID


class _FakeAttackRepo:
    def __init__(self, rows):
        self._rows = rows

    def get_recent(self, limit: int = 200):
        # get_recent orders by started DESC; mirror that.
        return sorted(self._rows, key=lambda r: r["started"], reverse=True)[:limit]


class _FakeChatRepo:
    def __init__(self):
        self.created: list[dict] = []

    def get_channel_by_name(self, name):
        if name == "war-room":
            return {"id": 42, "name": "war-room"}
        return None

    def create_message(self, **kwargs):
        msg = {"id": len(self.created) + 1, **kwargs}
        self.created.append(msg)
        return msg


class _FakeChatManager:
    def __init__(self):
        self.broadcasts: list[dict] = []

    async def broadcast(self, event):
        self.broadcasts.append(event)


class _FakeSettings:
    def __init__(self, init=None):
        self._d: dict[str, str] = dict(init or {})

    def get(self, key):
        return self._d.get(key)

    def set(self, key, value, updated_by=None):
        self._d[key] = value


@pytest.fixture(autouse=True)
def _reset_dedup():
    retal_feed._last_posted.clear()


def _row(*, id_, attacker_id, attacker_name, defender_id, defender_faction, result="Attacked", started=None):
    return {
        "id": id_,
        "attacker_id": attacker_id,
        "attacker_name": attacker_name,
        "defender_id": defender_id,
        "defender_name": f"Mate{defender_id}",
        "defender_faction_id": defender_faction,
        "result": result,
        "started": started or int(time.time()),
    }


@pytest.mark.asyncio
async def test_first_run_seeds_cursor_and_posts_recent_incoming():
    now = int(time.time())
    repo = _FakeAttackRepo([
        _row(id_=1, attacker_id=900, attacker_name="Bad", defender_id=5, defender_faction=FACTION_ID, started=now - 60),
        # Outgoing — we attacked someone else's faction, must be filtered out.
        _row(id_=2, attacker_id=5, attacker_name="Mate", defender_id=900, defender_faction=99, started=now - 50),
    ])
    chat = _FakeChatRepo()
    mgr = _FakeChatManager()
    settings = _FakeSettings()

    with patch.object(retal_feed, "get_state", return_value={
        "attack_repo": repo, "chat_repo": chat, "chat_manager": mgr,
        "settings_repo": settings,
    }):
        await retal_feed.run_retal_feed()

    assert len(chat.created) == 1
    assert "Bad" in chat.created[0]["content"]
    assert "torn.com/profiles.php?XID=900" in chat.created[0]["content"]
    assert mgr.broadcasts and mgr.broadcasts[0]["type"] == "message"
    # Cursor advanced.
    assert int(settings.get("retal_feed_last_ts")) >= now - 60


@pytest.mark.asyncio
async def test_dedup_skips_same_attacker_within_window():
    now = int(time.time())
    repo = _FakeAttackRepo([
        _row(id_=1, attacker_id=900, attacker_name="Bad", defender_id=5, defender_faction=FACTION_ID, started=now - 100),
        _row(id_=2, attacker_id=900, attacker_name="Bad", defender_id=6, defender_faction=FACTION_ID, started=now - 50),
    ])
    chat = _FakeChatRepo()
    mgr = _FakeChatManager()
    settings = _FakeSettings({"retal_feed_last_ts": str(now - 1000)})

    with patch.object(retal_feed, "get_state", return_value={
        "attack_repo": repo, "chat_repo": chat, "chat_manager": mgr,
        "settings_repo": settings,
    }):
        await retal_feed.run_retal_feed()

    # 2 incoming rows but same attacker → only 1 post.
    assert len(chat.created) == 1


@pytest.mark.asyncio
async def test_does_nothing_when_war_room_missing():
    chat = _FakeChatRepo()
    chat.get_channel_by_name = MagicMock(return_value=None)
    with patch.object(retal_feed, "get_state", return_value={
        "attack_repo": _FakeAttackRepo([]), "chat_repo": chat,
        "chat_manager": _FakeChatManager(), "settings_repo": _FakeSettings(),
    }):
        await retal_feed.run_retal_feed()
    assert chat.created == []


@pytest.mark.asyncio
async def test_ignores_attacks_before_cursor():
    now = int(time.time())
    repo = _FakeAttackRepo([
        # Older than cursor — skip.
        _row(id_=1, attacker_id=900, attacker_name="Bad", defender_id=5, defender_faction=FACTION_ID, started=now - 1000),
        # Newer than cursor — surface.
        _row(id_=2, attacker_id=901, attacker_name="Worse", defender_id=5, defender_faction=FACTION_ID, started=now - 30),
    ])
    chat = _FakeChatRepo()
    mgr = _FakeChatManager()
    settings = _FakeSettings({"retal_feed_last_ts": str(now - 100)})

    with patch.object(retal_feed, "get_state", return_value={
        "attack_repo": repo, "chat_repo": chat, "chat_manager": mgr,
        "settings_repo": settings,
    }):
        await retal_feed.run_retal_feed()

    assert len(chat.created) == 1
    assert "Worse" in chat.created[0]["content"]
