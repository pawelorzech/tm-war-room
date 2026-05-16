"""Purge-job tests for the Phase 3A activity tracker."""
from __future__ import annotations

import os

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.activity import ActivityRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return ActivityRepository(db_path=db_path)


@pytest.mark.asyncio
async def test_purge_drops_old_bins_keeps_recent(repo, monkeypatch):
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", True)
    from api.routers import activity as activity_mod
    from api.scheduler.jobs import activity_purge

    now = 2_000_000_000
    fifteen_days = 15 * 86400
    thirteen_days = 13 * 86400

    # One ancient bin (drop), one recent bin (keep).
    repo.add_bin(player_id=100, bin_start=now - fifteen_days, online_seconds=300)
    repo.add_bin(player_id=100, bin_start=now - thirteen_days, online_seconds=300)

    activity_mod.activity_repo = repo
    monkeypatch.setattr(activity_purge.time, "time", lambda: now)

    await activity_purge.run_activity_purge()

    rows = repo.bins_for(player_id=100, since=0)
    assert [r["bin_start"] for r in rows] == [now - thirteen_days]


@pytest.mark.asyncio
async def test_purge_drops_idle_outsiders(repo, monkeypatch):
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", True)
    from api.routers import activity as activity_mod
    from api.scheduler.jobs import activity_purge

    now = 2_000_000_000
    fifteen_days = 15 * 86400
    one_day = 86400

    # Outsider 100: enrolled 15 days ago, never seen → drop.
    repo.enroll_outsider(player_id=100, now=now - fifteen_days)
    # Outsider 200: enrolled long ago but was online yesterday → keep.
    repo.enroll_outsider(player_id=200, now=now - fifteen_days)
    repo.update_outsider_last_bin(player_id=200, last_bin_at=now - one_day)
    # Outsider 300: enrolled an hour ago, never seen → keep (anchor is fresh).
    repo.enroll_outsider(player_id=300, now=now - 3600)

    activity_mod.activity_repo = repo
    monkeypatch.setattr(activity_purge.time, "time", lambda: now)

    await activity_purge.run_activity_purge()

    kept = {r["player_id"] for r in repo.tracked_outsiders()}
    assert kept == {200, 300}


@pytest.mark.asyncio
async def test_purge_skips_when_flag_off(repo, monkeypatch):
    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", False)
    from api.routers import activity as activity_mod
    from api.scheduler.jobs import activity_purge

    now = 2_000_000_000
    repo.add_bin(player_id=100, bin_start=now - 30 * 86400, online_seconds=300)

    activity_mod.activity_repo = repo
    monkeypatch.setattr(activity_purge.time, "time", lambda: now)

    await activity_purge.run_activity_purge()

    # Flag-off → purge is a no-op, ancient bin survives.
    assert len(repo.bins_for(player_id=100, since=0)) == 1
