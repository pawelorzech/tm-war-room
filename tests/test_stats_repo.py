import os
import pytest
from api.db.repos.stats import StatSnapshotRepository
from api.db.migrations.runner import run_migrations

@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return StatSnapshotRepository(db_path)

def test_insert_snapshot(repo):
    repo.insert_snapshot(
        player_id=123, snapshot_date="2026-03-28",
        strength=1e9, defense=8e8, speed=5e8, dexterity=6e8, total=2.9e9,
        level=80, xanax_taken=5000, refills=2000, energy_drinks=1000, networth=5e9,
    )
    snaps = repo.get_snapshots(123)
    assert len(snaps) == 1
    assert snaps[0]["strength"] == 1e9
    assert snaps[0]["level"] == 80

def test_insert_duplicate_skips(repo):
    for _ in range(3):
        repo.insert_snapshot(
            player_id=123, snapshot_date="2026-03-28",
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        )
    snaps = repo.get_snapshots(123)
    assert len(snaps) == 1

def test_get_snapshots_ordered(repo):
    for day in ["2026-03-26", "2026-03-28", "2026-03-27"]:
        repo.insert_snapshot(
            player_id=123, snapshot_date=day,
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        )
    snaps = repo.get_snapshots(123)
    dates = [s["snapshot_date"] for s in snaps]
    assert dates == ["2026-03-26", "2026-03-27", "2026-03-28"]

def test_get_latest_snapshot(repo):
    repo.insert_snapshot(player_id=123, snapshot_date="2026-03-27",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9)
    repo.insert_snapshot(player_id=123, snapshot_date="2026-03-28",
        strength=2e9, defense=2e9, speed=2e9, dexterity=2e9, total=8e9)
    latest = repo.get_latest_snapshot(123)
    assert latest["total"] == 8e9
    assert latest["snapshot_date"] == "2026-03-28"
