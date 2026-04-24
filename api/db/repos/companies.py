from __future__ import annotations

import time
from datetime import date, timedelta

from api.db.repos.base import BaseRepository


class CompanySnapshotRepository(BaseRepository):
    """Daily snapshots for a company's financial + operational state + per-employee + per-stock rows.
    Populated by the collect_company_snapshots scheduler job."""

    # ---------- company-level (detailed + profile) ----------

    def insert_snapshot(
        self,
        *,
        company_id: int,
        snapshot_date: str,
        detailed: dict | None,
        profile: dict | None,
        scope: str = "director",
    ) -> None:
        """Upsert one (company_id, snapshot_date) row mixing detailed + profile fields.
        Either source may be None (non-director / no profile).

        scope='public' rows contain only profile data (weekly/daily income, rating,
        staffing) and are used for cross-company ranking. scope='director' rows
        additionally carry detailed-only fields (funds, trains_available, etc.).
        """
        d = detailed or {}
        p = profile or {}
        now = int(time.time())
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO company_snapshots (
                company_id, snapshot_date,
                company_funds, company_bank, advertising_budget, value,
                popularity, efficiency, environment, trains_available,
                rating, daily_income, daily_customers, weekly_income, weekly_customers,
                employees_hired, employees_capacity, recorded_at, scope
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id, snapshot_date) DO UPDATE SET
                company_funds=excluded.company_funds,
                company_bank=excluded.company_bank,
                advertising_budget=excluded.advertising_budget,
                value=excluded.value,
                popularity=excluded.popularity,
                efficiency=excluded.efficiency,
                environment=excluded.environment,
                trains_available=excluded.trains_available,
                rating=excluded.rating,
                daily_income=excluded.daily_income,
                daily_customers=excluded.daily_customers,
                weekly_income=excluded.weekly_income,
                weekly_customers=excluded.weekly_customers,
                employees_hired=excluded.employees_hired,
                employees_capacity=excluded.employees_capacity,
                recorded_at=excluded.recorded_at,
                scope=CASE
                    WHEN excluded.scope = 'director' THEN 'director'
                    WHEN company_snapshots.scope = 'director' THEN 'director'
                    ELSE excluded.scope
                END
            """,
            (
                company_id, snapshot_date,
                d.get("company_funds"), d.get("company_bank"), d.get("advertising_budget"), d.get("value"),
                d.get("popularity"), d.get("efficiency"), d.get("environment"), d.get("trains_available"),
                p.get("rating"), p.get("daily_income"), p.get("daily_customers"),
                p.get("weekly_income"), p.get("weekly_customers"),
                p.get("employees_hired"), p.get("employees_capacity"),
                now, scope,
            ),
        )
        conn.commit()

    def get_snapshots(self, company_id: int, days: int = 30) -> list[dict]:
        cutoff = (date.today() - timedelta(days=days)).isoformat()
        rows = self.execute(
            """
            SELECT * FROM company_snapshots
            WHERE company_id = ? AND snapshot_date >= ?
            ORDER BY snapshot_date ASC
            """,
            (company_id, cutoff),
        )
        return [dict(r) for r in rows]

    # ---------- per-employee snapshots ----------

    def insert_employee_snapshot(
        self,
        *,
        company_id: int,
        player_id: int,
        snapshot_date: str,
        employee: dict,
    ) -> None:
        eff = employee.get("effectiveness") or {}
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO company_employee_snapshots (
                company_id, player_id, snapshot_date,
                position, wage, days_in_company,
                effectiveness_total, effectiveness_working_stats, effectiveness_addiction,
                effectiveness_inactivity, effectiveness_merits, effectiveness_director_education,
                effectiveness_settled_in, recorded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id, player_id, snapshot_date) DO UPDATE SET
                position=excluded.position,
                wage=excluded.wage,
                days_in_company=excluded.days_in_company,
                effectiveness_total=excluded.effectiveness_total,
                effectiveness_working_stats=excluded.effectiveness_working_stats,
                effectiveness_addiction=excluded.effectiveness_addiction,
                effectiveness_inactivity=excluded.effectiveness_inactivity,
                effectiveness_merits=excluded.effectiveness_merits,
                effectiveness_director_education=excluded.effectiveness_director_education,
                effectiveness_settled_in=excluded.effectiveness_settled_in,
                recorded_at=excluded.recorded_at
            """,
            (
                company_id, player_id, snapshot_date,
                employee.get("position"),
                employee.get("wage"),
                employee.get("days_in_company"),
                eff.get("total"), eff.get("working_stats"), eff.get("addiction"),
                eff.get("inactivity"), eff.get("merits"), eff.get("director_education"),
                eff.get("settled_in"),
                int(time.time()),
            ),
        )
        conn.commit()

    def get_employee_trend(self, company_id: int, player_id: int, days: int = 30) -> list[dict]:
        cutoff = (date.today() - timedelta(days=days)).isoformat()
        rows = self.execute(
            """
            SELECT * FROM company_employee_snapshots
            WHERE company_id = ? AND player_id = ? AND snapshot_date >= ?
            ORDER BY snapshot_date ASC
            """,
            (company_id, player_id, cutoff),
        )
        return [dict(r) for r in rows]

    # ---------- per-stock snapshots ----------

    def insert_stock_snapshot(
        self,
        *,
        company_id: int,
        product_name: str,
        snapshot_date: str,
        item: dict,
    ) -> None:
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO company_stock_snapshots (
                company_id, product_name, snapshot_date,
                cost, price, rrp, in_stock, on_order, sold_amount, sold_worth, recorded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id, product_name, snapshot_date) DO UPDATE SET
                cost=excluded.cost, price=excluded.price, rrp=excluded.rrp,
                in_stock=excluded.in_stock, on_order=excluded.on_order,
                sold_amount=excluded.sold_amount, sold_worth=excluded.sold_worth,
                recorded_at=excluded.recorded_at
            """,
            (
                company_id, product_name, snapshot_date,
                item.get("cost"), item.get("price"), item.get("rrp"),
                item.get("in_stock"), item.get("on_order"),
                item.get("sold_amount"), item.get("sold_worth"),
                int(time.time()),
            ),
        )
        conn.commit()

    def get_stock_trend(self, company_id: int, days: int = 30) -> list[dict]:
        cutoff = (date.today() - timedelta(days=days)).isoformat()
        rows = self.execute(
            """
            SELECT * FROM company_stock_snapshots
            WHERE company_id = ? AND snapshot_date >= ?
            ORDER BY snapshot_date ASC, product_name ASC
            """,
            (company_id, cutoff),
        )
        return [dict(r) for r in rows]

    def get_stock_runway_baselines(
        self, company_id: int, week_start_ts: int
    ) -> dict[str, dict]:
        """Return per-product sales baselines for a calendar week runway.

        Prefer the latest snapshot before the week starts. If a product has no
        pre-week snapshot, fall back to the earliest snapshot after week start
        so the caller can still produce a partial-week estimate.
        """
        before_rows = self.execute(
            """
            WITH ranked AS (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY product_name ORDER BY recorded_at DESC) rn
                FROM company_stock_snapshots
                WHERE company_id = ? AND recorded_at < ?
            )
            SELECT product_name, sold_amount, sold_worth, recorded_at
            FROM ranked
            WHERE rn = 1
            """,
            (company_id, week_start_ts),
        )
        baselines: dict[str, dict] = {}
        for row in before_rows:
            d = dict(row)
            d["source"] = "before_week"
            d["history_complete"] = True
            baselines[d["product_name"]] = d

        after_rows = self.execute(
            """
            WITH ranked AS (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY product_name ORDER BY recorded_at ASC) rn
                FROM company_stock_snapshots
                WHERE company_id = ? AND recorded_at >= ?
            )
            SELECT product_name, sold_amount, sold_worth, recorded_at
            FROM ranked
            WHERE rn = 1
            """,
            (company_id, week_start_ts),
        )
        for row in after_rows:
            d = dict(row)
            if d["product_name"] in baselines:
                continue
            d["source"] = "within_week"
            d["history_complete"] = False
            baselines[d["product_name"]] = d

        return baselines

    # ---------- weekly aggregation (anchored to Mon 18:00 TCT) ----------

    def get_weekly_sales(
        self, company_id: int, week_start_ts: int, week_end_ts: int
    ) -> dict:
        """Delta of lifetime sold_amount/sold_worth between the last snapshot
        strictly before week_start_ts and the last snapshot strictly before
        week_end_ts. Returns {'products': [{product_name, amount, worth}], 'total_amount', 'total_worth'}.

        Returns zero totals if we have insufficient snapshots yet (e.g. first
        week after deploy)."""
        rows = self.execute(
            """
            WITH baseline AS (
                SELECT product_name, sold_amount, sold_worth,
                       ROW_NUMBER() OVER (PARTITION BY product_name ORDER BY recorded_at DESC) rn
                FROM company_stock_snapshots
                WHERE company_id = ? AND recorded_at < ?
            ),
            endval AS (
                SELECT product_name, sold_amount, sold_worth,
                       ROW_NUMBER() OVER (PARTITION BY product_name ORDER BY recorded_at DESC) rn
                FROM company_stock_snapshots
                WHERE company_id = ? AND recorded_at < ?
            )
            SELECT
                e.product_name,
                e.sold_amount - COALESCE(b.sold_amount, 0) AS amount,
                e.sold_worth  - COALESCE(b.sold_worth,  0) AS worth
            FROM (SELECT * FROM endval WHERE rn = 1) e
            LEFT JOIN (SELECT * FROM baseline WHERE rn = 1) b
                ON b.product_name = e.product_name
            """,
            (company_id, week_start_ts, company_id, week_end_ts),
        )
        products = []
        total_amount = 0
        total_worth = 0
        for r in rows:
            amt = max(0, r["amount"] or 0)
            wrt = max(0, r["worth"] or 0)
            products.append(
                {"product_name": r["product_name"], "amount": amt, "worth": wrt}
            )
            total_amount += amt
            total_worth += wrt
        return {
            "products": products,
            "total_amount": total_amount,
            "total_worth": total_worth,
        }

    def rank_companies_by_week(
        self,
        week_start_ts: int,
        week_end_ts: int,
        *,
        company_type: int | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Rank companies by the latest weekly_income snapshot within [week_start_ts, week_end_ts].

        Uses Torn's rolling 7-day weekly_income (the only metric exposed publicly
        for other companies). The snapshot closest to week_end represents that
        rolling window, which is the best available approximation of the
        Mon-18:00-anchored week."""
        base_sql = """
            WITH latest AS (
                SELECT cs.*,
                       ROW_NUMBER() OVER (PARTITION BY cs.company_id ORDER BY cs.recorded_at DESC) rn
                FROM company_snapshots cs
                WHERE cs.recorded_at <= ? AND cs.recorded_at > ?
            )
            SELECT
                l.company_id,
                l.weekly_income,
                l.weekly_customers,
                l.daily_income,
                l.daily_customers,
                l.rating,
                l.employees_hired,
                l.employees_capacity,
                l.recorded_at,
                l.scope,
                tc.name AS tracked_name,
                tc.company_type AS tracked_company_type,
                tc.source AS tracked_source
            FROM latest l
            LEFT JOIN tracked_companies tc ON tc.company_id = l.company_id
            WHERE l.rn = 1
              AND l.weekly_income IS NOT NULL
        """
        params: list = [week_end_ts, week_start_ts]
        if company_type is not None:
            base_sql += " AND tc.company_type = ?"
            params.append(company_type)
        base_sql += " ORDER BY l.weekly_income DESC LIMIT ?"
        params.append(limit)
        rows = self.execute(base_sql, tuple(params))
        return [dict(r) for r in rows]

    def get_own_weekly_snapshot(
        self, company_id: int, week_start_ts: int, week_end_ts: int
    ) -> dict | None:
        """Latest snapshot of OUR own company within [week_start_ts, week_end_ts].
        Used so the comparison view can show our full 'director' row alongside
        the public ranking."""
        row = self.execute_one(
            """
            SELECT * FROM company_snapshots
            WHERE company_id = ? AND recorded_at <= ? AND recorded_at > ?
            ORDER BY recorded_at DESC
            LIMIT 1
            """,
            (company_id, week_end_ts, week_start_ts),
        )
        return dict(row) if row else None

    def get_trains_available_series(
        self, company_id: int, days: int = 14
    ) -> list[dict]:
        """Daily trains_available values for stagnation detection."""
        cutoff = (date.today() - timedelta(days=days)).isoformat()
        rows = self.execute(
            """
            SELECT snapshot_date, trains_available
            FROM company_snapshots
            WHERE company_id = ? AND snapshot_date >= ?
              AND trains_available IS NOT NULL
            ORDER BY snapshot_date ASC
            """,
            (company_id, cutoff),
        )
        return [dict(r) for r in rows]

    def list_director_company_ids(self) -> list[int]:
        """All company_ids for which we have at least one scope='director' snapshot."""
        rows = self.execute(
            "SELECT DISTINCT company_id FROM company_snapshots WHERE scope = 'director'"
        )
        return [r["company_id"] for r in rows]
