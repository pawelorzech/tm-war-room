import os
import pytest
from datetime import datetime, timedelta
from api.db.repos.spies import SpyRepository
from api.db.migrations.runner import run_migrations
from api.services.spy import SpyService

@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(path, migrations_dir)
    return path

@pytest.fixture
def service(db_path):
    repo = SpyRepository(db_path)
    return SpyService(repo)

def _days_ago(n: int) -> str:
    return (datetime.utcnow() - timedelta(days=n)).isoformat()

def test_member_submit_wins_over_tornstats(service):
    service.repo.upsert_report(player_id=1, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at=_days_ago(2))
    service.repo.upsert_report(player_id=1, player_name="T", source="member_submit",
        strength=2e9, defense=2e9, speed=2e9, dexterity=2e9, total=8e9, confidence="exact", reported_at=_days_ago(1))
    service.refresh_estimate(1)
    est = service.repo.get_estimate(1)
    assert est["source"] == "member_submit"
    assert est["total"] == 8e9
    assert est["confidence"] == "exact"

def test_tornstats_wins_over_yata(service):
    service.repo.upsert_report(player_id=2, player_name="T", source="yata",
        strength=5e8, defense=5e8, speed=5e8, dexterity=5e8, total=2e9, confidence="estimate", reported_at=_days_ago(5))
    service.repo.upsert_report(player_id=2, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at=_days_ago(3))
    service.refresh_estimate(2)
    est = service.repo.get_estimate(2)
    assert est["source"] == "tornstats"

def test_stale_report_marked_as_stale(service):
    service.repo.upsert_report(player_id=3, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at=_days_ago(45))
    service.refresh_estimate(3)
    est = service.repo.get_estimate(3)
    assert est["confidence"] == "stale"

def test_no_reports_no_estimate(service):
    service.refresh_estimate(999)
    assert service.repo.get_estimate(999) is None

def test_newer_same_source_wins(service):
    service.repo.upsert_report(player_id=4, player_name="T", source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9, confidence="estimate", reported_at=_days_ago(10))
    service.repo.upsert_report(player_id=4, player_name="T", source="tornstats",
        strength=2e9, defense=2e9, speed=2e9, dexterity=2e9, total=8e9, confidence="estimate", reported_at=_days_ago(2))
    service.refresh_estimate(4)
    est = service.repo.get_estimate(4)
    assert est["total"] == 8e9
