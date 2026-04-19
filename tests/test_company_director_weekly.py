import os
import tempfile
import time

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.companies import CompanySnapshotRepository
from api.db.repos.tracked_companies import TrackedCompaniesRepository


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
def companies(db_path):
    return CompanySnapshotRepository(db_path=db_path)


@pytest.fixture
def tracked(db_path):
    return TrackedCompaniesRepository(db_path=db_path)


def _snapshot_with_ts(repo, company_id, snapshot_date, ts, profile_extras, scope="public"):
    """Directly write a snapshot with a specific recorded_at so we can test
    window boundaries without waiting real seconds."""
    conn = repo._conn()
    conn.execute(
        """
        INSERT INTO company_snapshots (
            company_id, snapshot_date,
            company_funds, company_bank, advertising_budget, value,
            popularity, efficiency, environment, trains_available,
            rating, daily_income, daily_customers, weekly_income, weekly_customers,
            employees_hired, employees_capacity, recorded_at, scope
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, snapshot_date) DO UPDATE SET
            weekly_income = excluded.weekly_income,
            recorded_at = excluded.recorded_at
        """,
        (
            company_id, snapshot_date,
            None, None, None, None, None, None, None, None,
            profile_extras.get("rating"),
            profile_extras.get("daily_income"),
            profile_extras.get("daily_customers"),
            profile_extras.get("weekly_income"),
            profile_extras.get("weekly_customers"),
            profile_extras.get("employees_hired"),
            profile_extras.get("employees_capacity"),
            ts, scope,
        ),
    )
    conn.commit()


def test_rank_companies_by_week_descending(companies, tracked):
    week_start = 1_000_000
    week_end = week_start + 7 * 86400
    mid = week_start + 3 * 86400

    _snapshot_with_ts(companies, 100, "2026-04-15", mid, {"weekly_income": 10_000_000, "rating": 10})
    _snapshot_with_ts(companies, 200, "2026-04-15", mid, {"weekly_income": 50_000_000, "rating": 10})
    _snapshot_with_ts(companies, 300, "2026-04-15", mid, {"weekly_income": 30_000_000, "rating": 10})

    tracked.upsert(company_id=100, company_type=1, rating=10, name="A", director_id=None, source="discovered")
    tracked.upsert(company_id=200, company_type=1, rating=10, name="B", director_id=None, source="discovered")
    tracked.upsert(company_id=300, company_type=2, rating=10, name="C", director_id=None, source="discovered")

    all_ranked = companies.rank_companies_by_week(week_start, week_end)
    assert [r["company_id"] for r in all_ranked] == [200, 300, 100]

    type1_only = companies.rank_companies_by_week(week_start, week_end, company_type=1)
    assert [r["company_id"] for r in type1_only] == [200, 100]


def test_rank_uses_latest_snapshot_in_window(companies, tracked):
    week_start = 1_000_000
    week_end = week_start + 7 * 86400

    # Two snapshots in-window — latest wins
    _snapshot_with_ts(companies, 100, "2026-04-13", week_start + 3600,
                      {"weekly_income": 10_000_000, "rating": 10})
    _snapshot_with_ts(companies, 100, "2026-04-19", week_end - 3600,
                      {"weekly_income": 99_000_000, "rating": 10})
    # Snapshot outside window is ignored
    _snapshot_with_ts(companies, 100, "2026-04-20", week_end + 3600,
                      {"weekly_income": 1, "rating": 10})

    tracked.upsert(company_id=100, company_type=1, rating=10, name="A", director_id=None, source="discovered")
    ranked = companies.rank_companies_by_week(week_start, week_end)
    assert len(ranked) == 1
    assert ranked[0]["weekly_income"] == 99_000_000


def test_weekly_sales_diff(companies):
    week_start = 2_000_000
    week_end = week_start + 7 * 86400

    # Stock snapshot just before week start (baseline)
    conn = companies._conn()
    conn.execute(
        """INSERT INTO company_stock_snapshots
           (company_id, product_name, snapshot_date, cost, price, rrp,
            in_stock, on_order, sold_amount, sold_worth, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (50000, "Shampoo", "2026-04-12", 10, 25, 25, 500, 0,
         10_000, 250_000, week_start - 3600),
    )
    # Mid-week snapshot (ignored for diff — only baseline and end used)
    conn.execute(
        """INSERT INTO company_stock_snapshots
           (company_id, product_name, snapshot_date, cost, price, rrp,
            in_stock, on_order, sold_amount, sold_worth, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (50000, "Shampoo", "2026-04-15", 10, 25, 25, 300, 0,
         12_500, 312_500, week_start + 3 * 86400),
    )
    # End-of-week snapshot (latest before week_end)
    conn.execute(
        """INSERT INTO company_stock_snapshots
           (company_id, product_name, snapshot_date, cost, price, rrp,
            in_stock, on_order, sold_amount, sold_worth, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (50000, "Shampoo", "2026-04-19", 10, 25, 25, 100, 0,
         15_000, 375_000, week_end - 3600),
    )
    conn.commit()

    sales = companies.get_weekly_sales(50000, week_start, week_end)
    assert sales["total_amount"] == 5_000  # 15000 - 10000
    assert sales["total_worth"] == 125_000  # 375000 - 250000
    assert len(sales["products"]) == 1
    assert sales["products"][0]["product_name"] == "Shampoo"


def test_get_trains_available_series(companies):
    from datetime import date, timedelta
    today = date.today()
    for offset, trains in [(3, 2), (2, 1), (1, 0), (0, 3)]:
        d = (today - timedelta(days=offset)).isoformat()
        companies.insert_snapshot(
            company_id=50000, snapshot_date=d,
            detailed={"trains_available": trains, "company_funds": 0, "company_bank": 0,
                      "advertising_budget": 0, "value": 0, "popularity": 0,
                      "efficiency": 0, "environment": 0},
            profile=None, scope="director",
        )
    series = companies.get_trains_available_series(50000, days=7)
    assert len(series) == 4
    assert [row["trains_available"] for row in series] == [2, 1, 0, 3]
