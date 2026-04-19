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
    ) -> None:
        """Upsert one (company_id, snapshot_date) row mixing detailed + profile fields.
        Either source may be None (non-director / no profile)."""
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
                employees_hired, employees_capacity, recorded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                recorded_at=excluded.recorded_at
            """,
            (
                company_id, snapshot_date,
                d.get("company_funds"), d.get("company_bank"), d.get("advertising_budget"), d.get("value"),
                d.get("popularity"), d.get("efficiency"), d.get("environment"), d.get("trains_available"),
                p.get("rating"), p.get("daily_income"), p.get("daily_customers"),
                p.get("weekly_income"), p.get("weekly_customers"),
                p.get("employees_hired"), p.get("employees_capacity"),
                now,
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
