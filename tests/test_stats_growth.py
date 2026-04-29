"""Edge cases for StatSnapshotRepository.get_growth + get_all_growth.

The growth math used to silently produce zero/garbage when a player only had
one snapshot, or when none of their snapshots predated the cutoff. These
tests pin the current expected behaviour so a refactor can't reintroduce it.
"""
import os
from datetime import date, timedelta

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.stats import StatSnapshotRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "growth.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return StatSnapshotRepository(db_path)


def _today(offset_days: int = 0) -> str:
    return (date.today() + timedelta(days=offset_days)).isoformat()


def test_get_growth_with_single_snapshot_returns_zero_growth(repo):
    """A new player with only today's snapshot should not 404 — they should
    see a zero-growth payload. Frontend renders this as 'just joined'."""
    repo.insert_snapshot(
        player_id=1, snapshot_date=_today(),
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
    )
    growth = repo.get_growth(1, days=30)
    assert growth is not None
    assert growth["growth"]["total"] == 0
    assert growth["from_date"] == growth["to_date"]


def test_get_growth_baseline_falls_back_to_oldest_when_no_pre_cutoff(repo):
    """If every snapshot is newer than the cutoff (e.g. 30-day window for a
    7-day-old member), baseline must fall back to the oldest snapshot.
    Otherwise we'd compute against `None` and crash."""
    repo.insert_snapshot(
        player_id=2, snapshot_date=_today(-5),
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
    )
    repo.insert_snapshot(
        player_id=2, snapshot_date=_today(),
        strength=1.5e9, defense=1e9, speed=1e9, dexterity=1e9, total=4.5e9,
    )
    growth = repo.get_growth(2, days=30)
    assert growth is not None
    assert growth["from_date"] == _today(-5)
    assert growth["to_date"] == _today()
    assert growth["growth"]["total"] == pytest.approx(5e8)


def test_get_all_growth_excludes_players_with_only_one_snapshot(repo):
    """Growth-leaderboard should not include players whose first==last
    snapshot — there's no growth signal there, just noise."""
    # Player A: only one snapshot in the window
    repo.insert_snapshot(
        player_id=10, snapshot_date=_today(-2),
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
    )
    # Player B: two snapshots, real growth
    repo.insert_snapshot(
        player_id=20, snapshot_date=_today(-10),
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
    )
    repo.insert_snapshot(
        player_id=20, snapshot_date=_today(),
        strength=2e9, defense=1e9, speed=1e9, dexterity=1e9, total=5e9,
    )
    rows = repo.get_all_growth(days=30)
    pids = {r["player_id"] for r in rows}
    assert 20 in pids
    assert 10 not in pids
