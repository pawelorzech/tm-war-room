from __future__ import annotations

import time

from api.db.repos.base import BaseRepository


class TrackedCompaniesRepository(BaseRepository):
    """Catalog of companies we snapshot daily (beyond TM members).

    source:
      * 'faction'     — member of TM, auto-added from training data
      * 'manual'      — director added this rival to their watchlist
      * 'discovered'  — found by sequential-ID discovery scan (class-10 farms etc.)
    """

    def upsert(
        self,
        *,
        company_id: int,
        company_type: int | None,
        rating: int | None,
        name: str | None,
        director_id: int | None,
        source: str,
    ) -> None:
        now = int(time.time())
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO tracked_companies (
                company_id, company_type, rating, name, director_id,
                source, first_seen_at, last_checked_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id) DO UPDATE SET
                company_type = COALESCE(excluded.company_type, company_type),
                rating       = COALESCE(excluded.rating, rating),
                name         = COALESCE(excluded.name, name),
                director_id  = COALESCE(excluded.director_id, director_id),
                last_checked_at = excluded.last_checked_at
            """,
            (company_id, company_type, rating, name, director_id, source, now, now),
        )
        conn.commit()

    def list_all(self) -> list[dict]:
        rows = self.execute("SELECT * FROM tracked_companies ORDER BY company_id")
        return [dict(r) for r in rows]

    def list_class_10(self, limit: int = 2000) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM tracked_companies WHERE rating = 10 ORDER BY company_id LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]

    def get(self, company_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM tracked_companies WHERE company_id = ?", (company_id,)
        )
        return dict(row) if row else None

    def delete(self, company_id: int) -> None:
        self.mutate("DELETE FROM tracked_companies WHERE company_id = ?", (company_id,))

    # ---------------- discovery cursor ----------------

    def get_discovery_cursor(self) -> int:
        row = self.execute_one(
            "SELECT last_scanned_id FROM company_discovery_cursor WHERE id = 1"
        )
        return row["last_scanned_id"] if row else 0

    def set_discovery_cursor(self, last_scanned_id: int) -> None:
        conn = self._conn()
        conn.execute(
            """
            UPDATE company_discovery_cursor
            SET last_scanned_id = ?, updated_at = ?
            WHERE id = 1
            """,
            (last_scanned_id, int(time.time())),
        )
        conn.commit()
