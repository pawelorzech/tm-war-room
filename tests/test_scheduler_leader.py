"""Tests for scheduler leader-election with Redis primary + file-lock fallback."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock

import pytest

from api.scheduler import leader as leader_mod
from api.scheduler.leader import LeaderElection


class FakeRedis:
    def __init__(self, holder: str | None = None):
        self.store: dict[str, str] = {}
        if holder is not None:
            self.store["tm:scheduler:leader"] = holder

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.store:
            return False
        self.store[key] = value
        return True

    async def get(self, key):
        return self.store.get(key)

    async def eval(self, *args, **kwargs):
        # Pretend renew always succeeds.
        return 1


async def test_acquire_via_redis_when_lock_free(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(leader_mod, "get_redis", lambda: fake, raising=False)
    # leader_mod imports get_redis lazily inside acquire, so patch the module it imports from
    from api import redis_client as rc
    monkeypatch.setattr(rc, "get_redis", lambda: fake)

    le = LeaderElection()
    ok = await le.acquire()
    assert ok is True
    assert le.is_leader is True
    assert "tm:scheduler:leader" in fake.store
    await le.release()


async def test_follower_when_redis_lock_held(monkeypatch, tmp_path):
    fake = FakeRedis(holder="other-host:9999")
    from api import redis_client as rc
    monkeypatch.setattr(rc, "get_redis", lambda: fake)

    le = LeaderElection()
    ok = await le.acquire()
    assert ok is False
    assert le.is_leader is False


async def test_falls_back_to_file_lock_when_no_redis(monkeypatch, tmp_path):
    from api import redis_client as rc
    monkeypatch.setattr(rc, "get_redis", lambda: None)
    monkeypatch.setattr(leader_mod, "FILE_LOCK_PATH", str(tmp_path / "scheduler.leader.lock"))

    le = LeaderElection()
    ok = await le.acquire()
    assert ok is True
    assert le.is_leader is True
    assert os.path.exists(str(tmp_path / "scheduler.leader.lock"))
    await le.release()


async def test_second_process_fails_file_lock(monkeypatch, tmp_path):
    from api import redis_client as rc
    monkeypatch.setattr(rc, "get_redis", lambda: None)
    lock_path = str(tmp_path / "scheduler.leader.lock")
    monkeypatch.setattr(leader_mod, "FILE_LOCK_PATH", lock_path)

    a = LeaderElection()
    assert await a.acquire() is True

    b = LeaderElection()
    # Second acquire on the same file lock from the same process won't block
    # via fcntl.flock (advisory, per-process), so we open a separate fd via
    # subprocess to simulate a true second worker. Skip if not POSIX.
    import subprocess, sys
    code = (
        "import os, fcntl, sys; "
        f"fd = os.open({lock_path!r}, os.O_RDWR | os.O_CREAT); "
        "ok = True\n"
        "try:\n    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)\nexcept BlockingIOError:\n    ok = False\n"
        "sys.exit(0 if not ok else 1)"
    )
    res = subprocess.run([sys.executable, "-c", code], capture_output=True)
    assert res.returncode == 0, "second process should NOT acquire the lock"

    await a.release()
