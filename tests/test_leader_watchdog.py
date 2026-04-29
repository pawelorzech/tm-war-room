"""Watchdog contract: failed acquire → retries → promotes on stale-lease expiry."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.scheduler import leader as leader_mod


class _FakeRedis:
    """Minimal Redis stub: SET NX EX semantics, programmable per-call result."""

    def __init__(self) -> None:
        self.set_results: list[bool] = []  # popped in order
        self.set_calls: list[dict] = []
        self.held_value = "stale-owner:18"

    async def set(self, key, value, *, nx=False, ex=None):
        self.set_calls.append({"key": key, "value": value, "nx": nx, "ex": ex})
        if not self.set_results:
            return False
        result = self.set_results.pop(0)
        if result:
            self.held_value = value  # we now hold it
        return result

    async def get(self, key):
        return self.held_value

    async def eval(self, *_args, **_kwargs):
        return 1


@pytest.mark.asyncio
async def test_follower_spawns_watchdog_on_failed_acquire():
    fake = _FakeRedis()
    fake.set_results = [False]  # busy
    le = leader_mod.LeaderElection()
    with patch("api.redis_client.get_redis", return_value=fake):
        ok = await le.acquire()
    assert ok is False
    assert le.is_leader is False
    assert le._watchdog_task is not None
    # Stop the watchdog cleanly via release() — that's the production path.
    await le.release()
    assert le._watchdog_task.done()


@pytest.mark.asyncio
async def test_watchdog_promotes_when_stale_lease_expires():
    """The previous leader's lease expires → next watchdog tick acquires →
    promotion callback fires."""
    fake = _FakeRedis()
    # First boot attempt: busy. Watchdog tick 1: still busy. Tick 2: free.
    fake.set_results = [False, False, True]
    le = leader_mod.LeaderElection()

    promoted = asyncio.Event()
    callback_calls: list[str] = []

    async def on_promotion():
        callback_calls.append(le._owner_id)
        promoted.set()

    le.set_promotion_callback(on_promotion)

    # Skip the real 35s sleep so the test runs in ms.
    real_sleep = asyncio.sleep

    async def fast_sleep(_secs):
        await real_sleep(0)

    with patch("api.redis_client.get_redis", return_value=fake), \
         patch.object(leader_mod.asyncio, "sleep", side_effect=fast_sleep):
        ok = await le.acquire()
        assert ok is False
        # Wait for watchdog to win and fire callback.
        await asyncio.wait_for(promoted.wait(), timeout=2.0)

    assert le.is_leader is True
    assert callback_calls == [le._owner_id]
    # Cleanup background tasks so they don't bleed into other tests.
    await le.release()


@pytest.mark.asyncio
async def test_watchdog_swallows_redis_errors_and_keeps_retrying():
    """A transient Redis failure during a watchdog tick must not kill the
    watchdog — the next tick keeps trying."""
    fake = _FakeRedis()
    # Boot acquire = False (busy). Watchdog tick 1 = raise.
    # Watchdog tick 2 = pop True (free now).
    fake.set_results = [False, True]
    le = leader_mod.LeaderElection()

    real_set = fake.set
    call_count = {"n": 0}

    async def flaky_set(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("redis transient")
        return await real_set(*args, **kwargs)

    fake.set = flaky_set  # type: ignore[method-assign]

    promoted = asyncio.Event()
    le.set_promotion_callback(lambda: promoted.set())

    real_sleep = asyncio.sleep
    async def fast_sleep(_):
        await real_sleep(0)

    with patch("api.redis_client.get_redis", return_value=fake), \
         patch.object(leader_mod.asyncio, "sleep", side_effect=fast_sleep):
        await le.acquire()
        await asyncio.wait_for(promoted.wait(), timeout=2.0)

    assert le.is_leader is True
    assert call_count["n"] >= 3, "watchdog must have retried after the raise"
    await le.release()
