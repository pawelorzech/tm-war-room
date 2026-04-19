import os
import tempfile
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.companies import CompanySnapshotRepository
from api.db.repos.tracked_companies import TrackedCompaniesRepository
from api.scheduler.jobs.collect_company_snapshots import collect_company_snapshots


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
def repo(db_path):
    return CompanySnapshotRepository(db_path=db_path)


@pytest.fixture
def tracked_repo(db_path):
    return TrackedCompaniesRepository(db_path=db_path)


@pytest.fixture
def key_repo():
    kr = MagicMock()
    kr.get_all_keys.return_value = [
        {"player_id": 123, "player_name": "Bombel", "api_key": "key-director"},
        {"player_id": 456, "player_name": "Jan", "api_key": "key-employee"},
    ]
    kr.get_faction_key.return_value = {"api_key": "key-director"}
    return kr


@pytest.mark.asyncio
async def test_collect_company_snapshots_director(repo, tracked_repo, key_repo):
    tc = AsyncMock()
    # key-director returns real data; key-employee returns None for director selections
    def _detailed(api_key):
        if api_key == "key-director":
            return {
                "company_funds": 50_000_000, "company_bank": 100_000_000,
                "advertising_budget": 1_000_000, "value": 500_000_000,
                "popularity": 8000, "efficiency": 7500, "environment": 500,
                "trains_available": 3,
            }
        return None

    tc.fetch_company_detailed = AsyncMock(side_effect=_detailed)
    tc.fetch_training_data = AsyncMock(return_value={
        "job": {"company_id": 50000, "company_name": "Bombel Co", "company_type": 34, "position": "Director"},
    })
    tc.fetch_company_profile = AsyncMock(return_value={
        "company": {"rating": 10, "daily_income": 5_000_000, "daily_customers": 2000,
                    "weekly_income": 35_000_000, "weekly_customers": 14000,
                    "employees_hired": 8, "employees_capacity": 10},
    })
    tc.fetch_company_employees = AsyncMock(return_value={
        "company_employees": {
            "123": {"name": "Bombel", "position": "Director", "wage": 0, "days_in_company": 500,
                    "effectiveness": {"total": 90}},
        }
    })
    tc.fetch_company_stock = AsyncMock(return_value={
        "company_stock": {"Shampoo": {"cost": 10, "price": 25, "rrp": 25, "in_stock": 500,
                                       "on_order": 0, "sold_amount": 1000, "sold_worth": 25000}}
    })

    await collect_company_snapshots(key_repo, repo, tracked_repo, tc)

    # detailed called for both keys (one real, one None)
    assert tc.fetch_company_detailed.await_count == 2
    # Only the director key triggers the downstream calls
    assert tc.fetch_training_data.await_count == 1
    assert tc.fetch_company_employees.await_count == 1
    assert tc.fetch_company_stock.await_count == 1

    snaps = repo.get_snapshots(50000, days=1)
    assert len(snaps) == 1
    assert snaps[0]["company_funds"] == 50_000_000
    assert snaps[0]["daily_income"] == 5_000_000

    emp_trend = repo.get_employee_trend(50000, 123, days=1)
    assert len(emp_trend) == 1
    assert emp_trend[0]["effectiveness_total"] == 90

    stock_trend = repo.get_stock_trend(50000, days=1)
    assert len(stock_trend) == 1
    assert stock_trend[0]["product_name"] == "Shampoo"


@pytest.mark.asyncio
async def test_collect_company_snapshots_no_director(repo, tracked_repo, key_repo):
    tc = AsyncMock()
    tc.fetch_company_detailed = AsyncMock(return_value=None)  # everyone's an employee

    await collect_company_snapshots(key_repo, repo, tracked_repo, tc)

    # No snapshot should have been written
    assert repo.get_snapshots(50000, days=1) == []
