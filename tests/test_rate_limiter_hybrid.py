"""Tests for HybridRateLimiter — sync local + async Redis-backed paths."""
from __future__ import annotations

import pytest

from api.auth import HybridRateLimiter
from api import redis_client as rc


class FakeRedisCounter:
    def __init__(self):
        self.counters: dict[str, int] = {}
        self.expires: dict[str, int] = {}

    def pipeline(self):
        return FakePipeline(self)


class FakePipeline:
    def __init__(self, parent: FakeRedisCounter):
        self.parent = parent
        self.ops: list = []

    def incr(self, key, by):
        self.ops.append(("incr", key, by))
        return self

    def expire(self, key, seconds, nx=False):
        self.ops.append(("expire", key, seconds, nx))
        return self

    async def execute(self):
        results = []
        for op in self.ops:
            if op[0] == "incr":
                _, key, by = op
                self.parent.counters[key] = self.parent.counters.get(key, 0) + by
                results.append(self.parent.counters[key])
            elif op[0] == "expire":
                _, key, seconds, nx = op
                if nx and key in self.parent.expires:
                    results.append(False)
                else:
                    self.parent.expires[key] = seconds
                    results.append(True)
        return results


async def test_sync_check_uses_local(monkeypatch):
    monkeypatch.setattr(rc, "get_redis", lambda: None)
    rl = HybridRateLimiter()
    for _ in range(5):
        assert rl.check("k", max_requests=5, window_seconds=60) is True
    assert rl.check("k", max_requests=5, window_seconds=60) is False


async def test_async_check_falls_back_when_no_redis(monkeypatch):
    monkeypatch.setattr(rc, "get_redis", lambda: None)
    rl = HybridRateLimiter()
    for _ in range(3):
        assert await rl.check_async("k", max_requests=3, window_seconds=60) is True
    assert await rl.check_async("k", max_requests=3, window_seconds=60) is False


async def test_async_check_uses_redis_counter(monkeypatch):
    fake = FakeRedisCounter()
    monkeypatch.setattr(rc, "get_redis", lambda: fake)
    rl = HybridRateLimiter()
    assert await rl.check_async("user:1", max_requests=2, window_seconds=10) is True
    assert await rl.check_async("user:1", max_requests=2, window_seconds=10) is True
    assert await rl.check_async("user:1", max_requests=2, window_seconds=10) is False
    # Different key gets its own counter
    assert await rl.check_async("user:2", max_requests=2, window_seconds=10) is True


async def test_async_check_falls_back_on_redis_error(monkeypatch):
    class Broken:
        def pipeline(self):
            class P:
                def incr(self, *a, **kw): return self
                def expire(self, *a, **kw): return self
                async def execute(self): raise RuntimeError("boom")
            return P()

    monkeypatch.setattr(rc, "get_redis", lambda: Broken())
    rl = HybridRateLimiter()
    # Should fall through to local limiter rather than raise
    assert await rl.check_async("k", max_requests=1, window_seconds=10) is True
    assert await rl.check_async("k", max_requests=1, window_seconds=10) is False
