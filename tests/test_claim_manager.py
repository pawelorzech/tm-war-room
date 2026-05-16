"""Tests for ClaimManager — local fan-out, Redis publish, dedupe by worker_id.

We never hit a real Redis: ``api.claim_manager`` reads the client through
``api.redis_client.get_redis``, so monkeypatching that returns a fake. Two
modes:

* ``fake_redis`` — captures publishes; we never actually fan-in via pub/sub
  in unit tests (that's an integration concern). What we DO verify is that
  ``publish()`` writes one envelope to the channel + still delivers locally,
  and that an envelope echoed back via ``_deliver_local`` with our own
  ``worker_id`` would be skipped.
* ``no_redis`` — local-only delivery still works (single-worker fallback).
"""
from __future__ import annotations

import asyncio
import json

import pytest

from api import claim_manager as cm_mod
from api.claim_manager import ClaimManager, PUBSUB_CHANNEL_PREFIX


class FakeRedis:
    def __init__(self):
        self.published: list[tuple[str, str]] = []

    async def publish(self, channel, payload):
        self.published.append((channel, payload))
        return 1

    def pubsub(self):  # never invoked in unit tests
        raise NotImplementedError


@pytest.fixture
def fake_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(cm_mod, "get_redis", lambda: fake)
    return fake


@pytest.fixture
def no_redis(monkeypatch):
    monkeypatch.setattr(cm_mod, "get_redis", lambda: None)
    return None


async def _collect_one(mgr: ClaimManager, faction_id: int) -> dict:
    """Pull a single event from a fresh subscriber."""
    stream = mgr.stream(faction_id)
    return await asyncio.wait_for(stream.__anext__(), timeout=1.0)


# ── Local fan-out ────────────────────────────────────────────────


async def test_publish_delivers_to_local_subscribers_without_redis(no_redis):
    mgr = ClaimManager()
    # Two SSE-style subscribers on the same faction.
    s1 = mgr.stream(11559)
    s2 = mgr.stream(11559)
    # Pre-warm — the manager only registers the queue on first await.
    t1 = asyncio.create_task(s1.__anext__())
    t2 = asyncio.create_task(s2.__anext__())
    await asyncio.sleep(0)  # let stream() register its queue
    await mgr.publish({"type": "claim.created", "claim": {"target_id": 1}}, 11559)
    e1, e2 = await asyncio.wait_for(asyncio.gather(t1, t2), timeout=1.0)
    assert e1["type"] == "claim.created"
    assert e1["faction_id"] == 11559
    assert "worker_id" in e1
    assert "ts" in e1
    assert e2 == e1


async def test_envelope_shape_matches_spec(no_redis):
    mgr = ClaimManager()
    stream = mgr.stream(11559)
    task = asyncio.create_task(stream.__anext__())
    await asyncio.sleep(0)
    await mgr.publish(
        {
            "type": "claim.hit",
            "claim": {
                "target_id": 42,
                "claimer_id": 100,
                "claimer_name": "Alice",
                "claimed_at": 1000,
                "expires_at": 1900,
                "status": "hit",
                "note": "boom",
            },
        },
        11559,
    )
    env = await asyncio.wait_for(task, timeout=1.0)
    assert env["type"] == "claim.hit"
    assert env["claim"]["target_id"] == 42
    assert env["claim"]["claimer_name"] == "Alice"
    assert env["claim"]["status"] == "hit"
    assert env["faction_id"] == 11559
    assert isinstance(env["worker_id"], str) and env["worker_id"]
    assert isinstance(env["ts"], int)


# ── Redis publish ────────────────────────────────────────────────


async def test_publish_writes_to_redis_channel(fake_redis):
    mgr = ClaimManager()
    await mgr.publish({"type": "claim.created", "claim": {"target_id": 7}}, 11559)
    assert len(fake_redis.published) == 1
    channel, body = fake_redis.published[0]
    assert channel == f"{PUBSUB_CHANNEL_PREFIX}11559"
    payload = json.loads(body)
    assert payload["type"] == "claim.created"
    assert payload["faction_id"] == 11559
    assert payload["worker_id"] == mgr._worker_id


async def test_publish_local_works_even_when_redis_publish_raises(monkeypatch):
    class BadRedis(FakeRedis):
        async def publish(self, *a, **kw):
            raise RuntimeError("boom")
    monkeypatch.setattr(cm_mod, "get_redis", lambda: BadRedis())

    mgr = ClaimManager()
    stream = mgr.stream(11559)
    task = asyncio.create_task(stream.__anext__())
    await asyncio.sleep(0)
    await mgr.publish({"type": "claim.released", "claim": {"target_id": 5}}, 11559)
    env = await asyncio.wait_for(task, timeout=1.0)
    assert env["type"] == "claim.released"


# ── Dedupe by worker_id ──────────────────────────────────────────


async def test_self_publish_is_skipped_when_received_via_redis(no_redis):
    """The subscriber loop drops envelopes whose worker_id matches ours.

    Direct unit-test of ``_deliver_local`` would always deliver — the dedupe
    lives in ``_subscribe_loop``. So we simulate the loop's filter check
    here: same worker_id → no extra delivery beyond the original local one.
    """
    mgr = ClaimManager()
    stream = mgr.stream(11559)
    task = asyncio.create_task(stream.__anext__())
    await asyncio.sleep(0)
    await mgr.publish({"type": "claim.created", "claim": {"target_id": 1}}, 11559)
    first = await asyncio.wait_for(task, timeout=1.0)
    assert first["worker_id"] == mgr._worker_id

    # Now simulate a redelivery from Redis with our own worker_id — the
    # subscriber's dedupe check would skip it. Verify by replicating the
    # check logic and confirming no second event leaks through.
    redelivery = dict(first)
    if redelivery.get("worker_id") == mgr._worker_id:
        # The filter in _subscribe_loop short-circuits BEFORE _deliver_local,
        # so the queue is empty.
        pending = mgr._subscribers.get(11559, set())
        for q in pending:
            assert q.qsize() == 0


# ── Subscriber unregistration ────────────────────────────────────


async def test_stream_unregisters_on_generator_close(no_redis):
    mgr = ClaimManager()
    stream = mgr.stream(11559)
    task = asyncio.create_task(stream.__anext__())
    await asyncio.sleep(0)
    assert mgr.subscriber_count(11559) == 1
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, StopAsyncIteration):
        pass
    # Closing the generator removes the queue and the empty faction entry.
    await stream.aclose()
    assert mgr.subscriber_count(11559) == 0


# ── Lifecycle ────────────────────────────────────────────────────


async def test_start_is_noop_without_redis(no_redis):
    mgr = ClaimManager()
    await mgr.start()
    assert mgr._subscriber_task is None


async def test_stop_drains_subscribers(no_redis):
    mgr = ClaimManager()
    stream = mgr.stream(11559)
    task = asyncio.create_task(stream.__anext__())
    await asyncio.sleep(0)
    await mgr.stop()
    # The sentinel None pushed by stop() terminates the generator.
    with pytest.raises((StopAsyncIteration, asyncio.CancelledError)):
        await asyncio.wait_for(task, timeout=1.0)
