import json
import os
import tempfile
import time
from datetime import date, timedelta

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.companies import CompanySnapshotRepository
from api.db.repos.company_alerts import CompanyAlertConfigRepository
from api.db.repos.notifications import NotificationRepository
from api.scheduler.jobs.check_trains_stagnation import check_trains_stagnation


@pytest.fixture
def db_path():
    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, "test.db")
    migrations_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "api", "db", "migrations"
    )
    run_migrations(path, migrations_dir)
    return path


@pytest.fixture
def repos(db_path):
    return (
        CompanySnapshotRepository(db_path=db_path),
        CompanyAlertConfigRepository(db_path=db_path),
        NotificationRepository(db_path=db_path),
    )


def _seed_trains(companies_repo, company_id, trains_by_offset):
    """trains_by_offset: dict {days_ago: trains_available}"""
    today = date.today()
    for offset, trains in trains_by_offset.items():
        d = (today - timedelta(days=offset)).isoformat()
        companies_repo.insert_snapshot(
            company_id=company_id,
            snapshot_date=d,
            detailed={"trains_available": trains, "company_funds": 0, "company_bank": 0,
                      "advertising_budget": 0, "value": 0, "popularity": 0,
                      "efficiency": 0, "environment": 0},
            profile=None,
            scope="director",
        )


def test_fires_notification_when_stagnant_for_threshold(repos):
    companies, alerts, notifs = repos
    _seed_trains(companies, 50000, {3: 2, 2: 2, 1: 2, 0: 2})
    alerts.upsert(company_id=50000, alert_type="company_trains_stagnant",
                  target_player_id=100, threshold_days=3)
    check_trains_stagnation(companies, alerts, notifs)
    recent = notifs.get_recent(100, limit=10)
    assert len(recent) == 1
    assert recent[0]["type"] == "company_trains_stagnant"
    assert recent[0]["data"]["company_id"] == 50000
    assert recent[0]["data"]["stagnant_days"] >= 3


def test_skips_when_below_threshold(repos):
    companies, alerts, notifs = repos
    # Only 2 consecutive days of trains available — below threshold of 3
    _seed_trains(companies, 50000, {4: 0, 3: 2, 2: 2, 1: 0, 0: 2})
    alerts.upsert(company_id=50000, alert_type="company_trains_stagnant",
                  target_player_id=100, threshold_days=3)
    check_trains_stagnation(companies, alerts, notifs)
    assert notifs.get_recent(100, limit=10) == []


def test_resets_when_trains_hit_zero_in_middle(repos):
    companies, alerts, notifs = repos
    # 4 days ago had trains, but 1 day ago was 0 → streak broken
    _seed_trains(companies, 50000, {4: 2, 3: 2, 2: 2, 1: 0, 0: 2})
    alerts.upsert(company_id=50000, alert_type="company_trains_stagnant",
                  target_player_id=100, threshold_days=3)
    check_trains_stagnation(companies, alerts, notifs)
    # Most recent streak is 1 day (only today), below threshold
    assert notifs.get_recent(100, limit=10) == []


def test_dedup_within_24h(repos):
    companies, alerts, notifs = repos
    _seed_trains(companies, 50000, {3: 2, 2: 2, 1: 2, 0: 2})
    alerts.upsert(company_id=50000, alert_type="company_trains_stagnant",
                  target_player_id=100, threshold_days=3)
    check_trains_stagnation(companies, alerts, notifs)
    check_trains_stagnation(companies, alerts, notifs)  # second run
    assert len(notifs.get_recent(100, limit=10)) == 1  # not duplicated


def test_multiple_recipients_per_company(repos):
    companies, alerts, notifs = repos
    _seed_trains(companies, 50000, {3: 5, 2: 5, 1: 5, 0: 5})
    alerts.upsert(company_id=50000, alert_type="company_trains_stagnant",
                  target_player_id=100)
    alerts.upsert(company_id=50000, alert_type="company_trains_stagnant",
                  target_player_id=200)
    check_trains_stagnation(companies, alerts, notifs)
    assert len(notifs.get_recent(100, limit=10)) == 1
    assert len(notifs.get_recent(200, limit=10)) == 1
