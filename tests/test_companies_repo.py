import os
import tempfile

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.companies import CompanySnapshotRepository


@pytest.fixture
def repo():
    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "test.db")
    migrations_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "api", "db", "migrations"
    )
    run_migrations(db_path, migrations_dir)
    return CompanySnapshotRepository(db_path=db_path)


def test_insert_and_get_company_snapshot(repo):
    repo.insert_snapshot(
        company_id=50000,
        snapshot_date="2026-04-19",
        detailed={
            "company_funds": 50_000_000,
            "company_bank": 100_000_000,
            "advertising_budget": 1_000_000,
            "value": 500_000_000,
            "popularity": 8000,
            "efficiency": 7500,
            "environment": 500,
            "trains_available": 3,
        },
        profile={
            "rating": 10,
            "daily_income": 5_000_000,
            "daily_customers": 2000,
            "weekly_income": 35_000_000,
            "weekly_customers": 14000,
            "employees_hired": 8,
            "employees_capacity": 10,
        },
    )
    rows = repo.get_snapshots(50000, days=30)
    assert len(rows) == 1
    r = rows[0]
    assert r["company_funds"] == 50_000_000
    assert r["daily_income"] == 5_000_000
    assert r["employees_hired"] == 8


def test_upsert_same_day_overwrites(repo):
    repo.insert_snapshot(
        company_id=50000, snapshot_date="2026-04-19",
        detailed={"company_funds": 1}, profile=None,
    )
    repo.insert_snapshot(
        company_id=50000, snapshot_date="2026-04-19",
        detailed={"company_funds": 2}, profile=None,
    )
    rows = repo.get_snapshots(50000, days=30)
    assert len(rows) == 1
    assert rows[0]["company_funds"] == 2


def test_employee_snapshot(repo):
    repo.insert_employee_snapshot(
        company_id=50000, player_id=123, snapshot_date="2026-04-19",
        employee={
            "position": "Manager",
            "wage": 50000,
            "days_in_company": 90,
            "effectiveness": {
                "total": 85, "working_stats": 30, "addiction": 10,
                "inactivity": 0, "merits": 5, "director_education": 20, "settled_in": 20,
            },
        },
    )
    trend = repo.get_employee_trend(50000, 123, days=30)
    assert len(trend) == 1
    assert trend[0]["effectiveness_total"] == 85
    assert trend[0]["position"] == "Manager"


def test_stock_snapshot(repo):
    repo.insert_stock_snapshot(
        company_id=50000, product_name="Shampoo", snapshot_date="2026-04-19",
        item={
            "cost": 10, "price": 25, "rrp": 25,
            "in_stock": 500, "on_order": 0,
            "sold_amount": 1000, "sold_worth": 25000,
        },
    )
    trend = repo.get_stock_trend(50000, days=30)
    assert len(trend) == 1
    assert trend[0]["product_name"] == "Shampoo"
    assert trend[0]["sold_amount"] == 1000


def test_stock_runway_baselines_prefer_before_week(repo):
    week_start = 2_000_000
    conn = repo._conn()
    conn.execute(
        """INSERT INTO company_stock_snapshots
           (company_id, product_name, snapshot_date, cost, price, rrp,
            in_stock, on_order, sold_amount, sold_worth, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (50000, "Shampoo", "2026-04-12", 10, 25, 25, 500, 0, 100, 2500, week_start - 60),
    )
    conn.execute(
        """INSERT INTO company_stock_snapshots
           (company_id, product_name, snapshot_date, cost, price, rrp,
            in_stock, on_order, sold_amount, sold_worth, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (50000, "Shampoo", "2026-04-13", 10, 25, 25, 450, 0, 110, 2750, week_start + 60),
    )
    conn.commit()

    baselines = repo.get_stock_runway_baselines(50000, week_start)
    assert baselines["Shampoo"]["sold_amount"] == 100
    assert baselines["Shampoo"]["source"] == "before_week"
    assert baselines["Shampoo"]["history_complete"] is True


def test_stock_runway_baselines_fall_back_to_earliest_in_week(repo):
    week_start = 2_000_000
    conn = repo._conn()
    conn.execute(
        """INSERT INTO company_stock_snapshots
           (company_id, product_name, snapshot_date, cost, price, rrp,
            in_stock, on_order, sold_amount, sold_worth, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (50000, "Shampoo", "2026-04-13", 10, 25, 25, 450, 0, 110, 2750, week_start + 120),
    )
    conn.execute(
        """INSERT INTO company_stock_snapshots
           (company_id, product_name, snapshot_date, cost, price, rrp,
            in_stock, on_order, sold_amount, sold_worth, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (50000, "Shampoo", "2026-04-14", 10, 25, 25, 430, 0, 130, 3250, week_start + 86400),
    )
    conn.commit()

    baselines = repo.get_stock_runway_baselines(50000, week_start)
    assert baselines["Shampoo"]["sold_amount"] == 110
    assert baselines["Shampoo"]["source"] == "within_week"
    assert baselines["Shampoo"]["history_complete"] is False
