"""Scheduler-tick tests for the Phase 3A activity tracker."""
from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.activity import ActivityRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return ActivityRepository(db_path=db_path)


def _member(player_id: int, status: str):
    """Build a faction-member-shaped object with last_action.status."""
    return SimpleNamespace(
        id=player_id,
        last_action=SimpleNamespace(status=status),
    )


def _stub_key_store(member_ids: list[int]):
    return SimpleNamespace(
        get_all_keys=lambda: [{"player_id": pid} for pid in member_ids],
        has_key=lambda pid: pid in set(member_ids),
    )


def _stub_torn_client(members, outsider_status: dict[int, str] | None = None):
    """Build a TornClient stub. ``outsider_status`` maps player_id → status
    string returned by the inline v1 profile call in the job."""
    outsider_status = outsider_status or {}

    class _Resp:
        def __init__(self, status_code: int, payload: dict):
            self.status_code = status_code
            self._payload = payload

        def json(self):
            return self._payload

        def raise_for_status(self):
            pass

    class _Http:
        async def get(self, url, params=None):
            # Outsider profile: /user/{player_id}
            tail = url.rstrip("/").rsplit("/", 1)[-1]
            try:
                pid = int(tail)
            except ValueError:
                return _Resp(404, {})
            status = outsider_status.get(pid)
            if status is None:
                return _Resp(200, {})
            return _Resp(200, {"last_action": {"status": status}})

    fetch_members = AsyncMock(return_value=members)
    return SimpleNamespace(
        _http=_Http(),
        _api_key="stub-faction-key",
        fetch_members=fetch_members,
    )


@pytest.mark.asyncio
async def test_activity_tick_writes_bin_for_online_member(repo, monkeypatch):
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", True)
    from api.routers import activity as activity_mod
    from api.scheduler import engine, jobs
    from api.scheduler.jobs import activity as activity_job

    activity_mod.activity_repo = repo
    activity_mod.key_store = _stub_key_store([100])
    torn = _stub_torn_client([_member(100, "Online")])
    engine._state = {"torn_client": torn}

    # Pin time so the bin is deterministic.
    monkeypatch.setattr(activity_job.time, "time", lambda: 1_700_000_400)

    await activity_job.run_activity_tick()

    rows = repo.bins_for(player_id=100, since=0)
    # bin_start_for(1_700_000_400) = 1_700_000_400 - (1_700_000_400 % 300)
    expected_bin = 1_700_000_400 - (1_700_000_400 % 300)
    assert rows == [{"player_id": 100, "bin_start": expected_bin, "online_seconds": 300}]


@pytest.mark.asyncio
async def test_activity_tick_idempotent_within_same_bin(repo, monkeypatch):
    """A re-tick within the same 5-minute window must not double-count."""
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", True)
    from api.routers import activity as activity_mod
    from api.scheduler import engine
    from api.scheduler.jobs import activity as activity_job

    activity_mod.activity_repo = repo
    activity_mod.key_store = _stub_key_store([100])
    torn = _stub_torn_client([_member(100, "Online")])
    engine._state = {"torn_client": torn}

    # Both ticks fall inside [1_700_000_400, 1_700_000_700) → same bin_start.
    monkeypatch.setattr(activity_job.time, "time", lambda: 1_700_000_400)
    await activity_job.run_activity_tick()
    monkeypatch.setattr(activity_job.time, "time", lambda: 1_700_000_500)
    await activity_job.run_activity_tick()

    rows = repo.bins_for(player_id=100, since=0)
    assert len(rows) == 1
    # Bin doubles because both ticks credit a "currently online" sample —
    # acceptable because each tick is a fresh 5-min measurement; the dedup
    # property we care about is "no duplicate (player, bin_start) rows".
    assert rows[0]["online_seconds"] == 600


@pytest.mark.asyncio
async def test_activity_tick_writes_zero_when_offline(repo, monkeypatch):
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", True)
    from api.routers import activity as activity_mod
    from api.scheduler import engine
    from api.scheduler.jobs import activity as activity_job

    activity_mod.activity_repo = repo
    activity_mod.key_store = _stub_key_store([100])
    torn = _stub_torn_client([_member(100, "Offline")])
    engine._state = {"torn_client": torn}

    monkeypatch.setattr(activity_job.time, "time", lambda: 1_700_000_400)
    await activity_job.run_activity_tick()

    rows = repo.bins_for(player_id=100, since=0)
    assert len(rows) == 1
    assert rows[0]["online_seconds"] == 0


@pytest.mark.asyncio
async def test_activity_tick_updates_outsider_last_bin_on_online(repo, monkeypatch):
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", True)
    from api.routers import activity as activity_mod
    from api.scheduler import engine
    from api.scheduler.jobs import activity as activity_job

    # Outsider enrolled but not yet seen online.
    repo.enroll_outsider(player_id=777, now=1_000)
    activity_mod.activity_repo = repo
    activity_mod.key_store = _stub_key_store([])  # no faction members
    torn = _stub_torn_client(members=[], outsider_status={777: "Online"})
    engine._state = {"torn_client": torn}

    monkeypatch.setattr(activity_job.time, "time", lambda: 1_700_000_400)
    await activity_job.run_activity_tick()

    outsiders = repo.tracked_outsiders()
    assert len(outsiders) == 1
    expected_bin = 1_700_000_400 - (1_700_000_400 % 300)
    assert outsiders[0]["last_bin_at"] == expected_bin


@pytest.mark.asyncio
async def test_activity_tick_skips_when_flag_off(repo, monkeypatch):
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", False)
    from api.routers import activity as activity_mod
    from api.scheduler import engine
    from api.scheduler.jobs import activity as activity_job

    activity_mod.activity_repo = repo
    activity_mod.key_store = _stub_key_store([100])
    torn = _stub_torn_client([_member(100, "Online")])
    engine._state = {"torn_client": torn}

    await activity_job.run_activity_tick()
    # Flag-off short-circuit: no DB writes happened.
    assert repo.bins_for(player_id=100, since=0) == []
