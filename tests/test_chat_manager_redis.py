"""Tests for ChatManager Redis pub/sub fan-out and fallback paths.

We avoid hitting a real Redis: the chat_manager calls ``api.redis_client.get_redis()``
to obtain a client, so we patch that to return a fake. Two fakes:

* ``FakeRedisOK`` — records publishes and supports basic SCAN/SET/DEL.
* No patch (default) — ``get_redis()`` returns None, exercising the fallback.

The fake doesn't simulate cross-process pub/sub delivery — that's an integration
concern. We only verify ChatManager publishes to Redis when available, and
delivers locally when not.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from api import chat_manager as cm_mod
from api.chat_manager import ChatManager, PUBSUB_CHANNEL


class FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.sent: list[str] = []
        self.closed: tuple[int, str] | None = None

    async def accept(self):
        self.accepted = True

    async def send_text(self, payload: str):
        self.sent.append(payload)

    async def close(self, code: int = 1000, reason: str = ""):
        self.closed = (code, reason)


class FakeRedis:
    def __init__(self):
        self.published: list[tuple[str, str]] = []
        self.set_calls: list[tuple] = []
        self.deleted: list[str] = []

    async def publish(self, channel, payload):
        self.published.append((channel, payload))
        return 1

    async def set(self, key, value, ex=None, nx=False):
        self.set_calls.append((key, value, ex, nx))
        return True

    async def delete(self, key):
        self.deleted.append(key)
        return 1

    async def scan_iter(self, match=None, count=100):
        for _ in []:
            yield _


@pytest.fixture
def fake_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(cm_mod, "get_redis", lambda: fake)
    return fake


@pytest.fixture
def no_redis(monkeypatch):
    monkeypatch.setattr(cm_mod, "get_redis", lambda: None)
    return None


async def test_broadcast_publishes_to_redis_when_available(fake_redis):
    mgr = ChatManager()
    await mgr.broadcast({"type": "message", "payload": {"id": 1}})
    assert len(fake_redis.published) == 1
    channel, body = fake_redis.published[0]
    assert channel == PUBSUB_CHANNEL
    assert '"type": "message"' in body
    assert '"_origin"' in body  # envelope tagged with worker id


async def test_broadcast_falls_back_to_local_when_redis_publish_fails(monkeypatch):
    bad = FakeRedis()
    bad.publish = AsyncMock(side_effect=Exception("boom"))
    monkeypatch.setattr(cm_mod, "get_redis", lambda: bad)

    mgr = ChatManager()
    ws = FakeWebSocket()
    await mgr.connect(123, ws)
    ws.sent.clear()  # ignore connection-side effects
    await mgr.broadcast({"type": "msg", "payload": {"x": 1}})
    # Local fallback must reach connected ws.
    assert any('"type": "msg"' in s for s in ws.sent)


async def test_broadcast_no_redis_delivers_locally(no_redis):
    mgr = ChatManager()
    a, b = FakeWebSocket(), FakeWebSocket()
    await mgr.connect(1, a)
    await mgr.connect(2, b)
    a.sent.clear(); b.sent.clear()
    await mgr.broadcast({"type": "ping"})
    assert any('"ping"' in s for s in a.sent)
    assert any('"ping"' in s for s in b.sent)


async def test_broadcast_no_redis_respects_exclude(no_redis):
    mgr = ChatManager()
    a, b = FakeWebSocket(), FakeWebSocket()
    await mgr.connect(1, a)
    await mgr.connect(2, b)
    a.sent.clear(); b.sent.clear()
    await mgr.broadcast({"type": "self"}, exclude=1)
    assert a.sent == []
    assert any('"self"' in s for s in b.sent)


async def test_connect_marks_player_online_in_redis(fake_redis):
    mgr = ChatManager()
    ws = FakeWebSocket()
    await mgr.connect(42, ws)
    keys = [c[0] for c in fake_redis.set_calls]
    assert "tm:chat:online:42" in keys
    # TTL is set
    ttls = [c[2] for c in fake_redis.set_calls if c[0] == "tm:chat:online:42"]
    assert all(isinstance(t, int) and t > 0 for t in ttls)


async def test_get_online_returns_local_when_no_redis(no_redis):
    mgr = ChatManager()
    a = FakeWebSocket()
    await mgr.connect(7, a)
    online = await mgr.get_online_players()
    assert 7 in online


async def test_send_to_player_local_fast_path(fake_redis):
    mgr = ChatManager()
    ws = FakeWebSocket()
    await mgr.connect(99, ws)
    ws.sent.clear()
    delivered = await mgr.send_to_player(99, {"type": "dm"})
    assert delivered is True
    assert any('"dm"' in s for s in ws.sent)
    # Should NOT have published to Redis since we delivered locally.
    assert all('"target"' not in body for _, body in fake_redis.published)


async def test_send_to_player_publishes_when_not_local(fake_redis):
    mgr = ChatManager()
    delivered = await mgr.send_to_player(404, {"type": "dm"})
    assert delivered is True
    assert len(fake_redis.published) == 1
    _, body = fake_redis.published[0]
    assert '"target": 404' in body


async def test_close_all_clears_connections_and_cancels_tasks(fake_redis):
    mgr = ChatManager()
    a = FakeWebSocket()
    await mgr.connect(1, a)
    await mgr.close_all()
    assert mgr._connections == {}
    assert a.closed is not None
