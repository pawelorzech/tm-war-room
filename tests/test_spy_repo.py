import os
import pytest
from api.db.repos.spies import SpyRepository
from api.db.migrations.runner import run_migrations

@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return SpyRepository(db_path)

def test_upsert_and_get_reports(repo):
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    repo.upsert_report(player_id=12345, player_name="Target", source="tornstats",
        strength=1e9, defense=8e8, speed=5e8, dexterity=6e8, total=2.9e9, confidence="estimate", reported_at=now)
    reports = repo.get_reports(12345)
    assert len(reports) == 1
    assert reports[0]["player_name"] == "Target"
    assert reports[0]["source"] == "tornstats"
    assert reports[0]["strength"] == 1e9

def test_upsert_deduplicates(repo):
    ts = "2026-03-28T12:00:00"
    for _ in range(3):
        repo.upsert_report(player_id=100, player_name="Dup", source="yata",
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at=ts)
    reports = repo.get_reports(100)
    assert len(reports) == 1

def test_update_estimate(repo):
    repo.update_estimate(player_id=200, player_name="Est", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at="2026-03-28T12:00:00")
    est = repo.get_estimate(200)
    assert est is not None
    assert est["total"] == 4e9
    assert est["source"] == "tornstats"

def test_update_estimate_overwrites(repo):
    repo.update_estimate(player_id=200, player_name="Est", source="yata",
        strength=5e8, defense=5e8, speed=5e8, dexterity=5e8, total=2e9, confidence="estimate", reported_at="2026-03-27T12:00:00")
    repo.update_estimate(player_id=200, player_name="Est", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at="2026-03-28T12:00:00")
    est = repo.get_estimate(200)
    assert est["source"] == "tornstats"
    assert est["total"] == 4e9

def test_get_estimate_returns_none(repo):
    assert repo.get_estimate(99999) is None

def test_get_all_estimates(repo):
    for pid in [1, 2, 3]:
        repo.update_estimate(player_id=pid, player_name=f"P{pid}", source="tornstats",
            strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at="2026-03-28T12:00:00")
    estimates = repo.get_all_estimates()
    assert len(estimates) == 3
