"""Smoke tests for ActivityRepository (Phase 0)."""
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


def test_add_bin_sums_on_conflict(repo):
    repo.add_bin(player_id=100, bin_start=1700000000, online_seconds=30)
    repo.add_bin(player_id=100, bin_start=1700000000, online_seconds=45)
    bins = repo.bins_for(player_id=100, since=0)
    assert len(bins) == 1
    assert bins[0]["online_seconds"] == 75


def test_bins_for_filters_by_since_and_orders_oldest_first(repo):
    repo.add_bin(player_id=100, bin_start=300, online_seconds=10)
    repo.add_bin(player_id=100, bin_start=100, online_seconds=10)
    repo.add_bin(player_id=100, bin_start=200, online_seconds=10)
    rows = repo.bins_for(player_id=100, since=150)
    assert [r["bin_start"] for r in rows] == [200, 300]


def test_bins_for_isolates_per_player(repo):
    repo.add_bin(player_id=100, bin_start=1, online_seconds=10)
    repo.add_bin(player_id=200, bin_start=1, online_seconds=10)
    assert len(repo.bins_for(player_id=100, since=0)) == 1
    assert len(repo.bins_for(player_id=200, since=0)) == 1


def test_purge_old_bins_drops_only_stale_rows(repo):
    repo.add_bin(player_id=100, bin_start=10, online_seconds=1)
    repo.add_bin(player_id=100, bin_start=20, online_seconds=1)
    repo.add_bin(player_id=100, bin_start=30, online_seconds=1)
    removed = repo.purge_old_bins(cutoff=25)
    assert removed == 2
    rows = repo.bins_for(player_id=100, since=0)
    assert [r["bin_start"] for r in rows] == [30]


def test_enroll_outsider_idempotent_and_tracked_outsiders(repo):
    repo.enroll_outsider(player_id=100, now=1_000)
    repo.enroll_outsider(player_id=100, now=2_000)  # re-enroll is a no-op
    repo.enroll_outsider(player_id=200, now=1_500)
    rows = repo.tracked_outsiders()
    assert len(rows) == 2
    by_pid = {r["player_id"]: r for r in rows}
    # Phase 3A: enrolled_at locks on first insert so the 14-day purge anchor
    # reflects when we started tracking, not the most recent profile view.
    assert by_pid[100]["enrolled_at"] == 1_000
    assert by_pid[100]["last_bin_at"] is None


def test_update_last_bin_persists(repo):
    repo.enroll_outsider(player_id=100, now=1_000)
    repo.update_last_bin(player_id=100, last_bin_at=5_000)
    rows = repo.tracked_outsiders()
    assert rows[0]["last_bin_at"] == 5_000


def test_purge_idle_outsiders_evaluates_against_last_bin_or_enrolled(repo):
    repo.enroll_outsider(player_id=100, now=1_000)
    repo.enroll_outsider(player_id=200, now=1_000)
    repo.update_last_bin(player_id=200, last_bin_at=9_000)
    # now=10_000, idle=2_000 ⇒ cutoff=8_000.
    # player 100 enrolled_at=1_000 < 8_000 → purged.
    # player 200 last_bin_at=9_000 ≥ 8_000 → kept.
    removed = repo.purge_idle_outsiders(now=10_000, idle_seconds=2_000)
    assert removed == 1
    rows = repo.tracked_outsiders()
    assert [r["player_id"] for r in rows] == [200]
