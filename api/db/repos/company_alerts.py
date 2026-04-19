from __future__ import annotations

import time

from api.db.repos.base import BaseRepository


class CompanyAlertConfigRepository(BaseRepository):
    """Who gets pinged for which company alerts.

    One row per (company_id, alert_type, target_player_id). Multiple recipients
    per alert are fine — director picks employees from the UI employee list.
    """

    def list_for_company(self, company_id: int, alert_type: str | None = None) -> list[dict]:
        if alert_type is None:
            rows = self.execute(
                "SELECT * FROM company_alert_config WHERE company_id = ?",
                (company_id,),
            )
        else:
            rows = self.execute(
                """
                SELECT * FROM company_alert_config
                WHERE company_id = ? AND alert_type = ?
                """,
                (company_id, alert_type),
            )
        return [dict(r) for r in rows]

    def upsert(
        self,
        *,
        company_id: int,
        alert_type: str,
        target_player_id: int,
        threshold_days: int = 3,
    ) -> None:
        now = int(time.time())
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO company_alert_config
                (company_id, alert_type, target_player_id, threshold_days, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(company_id, alert_type, target_player_id) DO UPDATE SET
                threshold_days = excluded.threshold_days
            """,
            (company_id, alert_type, target_player_id, threshold_days, now),
        )
        conn.commit()

    def delete(self, *, company_id: int, alert_type: str, target_player_id: int) -> None:
        self.mutate(
            """
            DELETE FROM company_alert_config
            WHERE company_id = ? AND alert_type = ? AND target_player_id = ?
            """,
            (company_id, alert_type, target_player_id),
        )

    def list_by_type(self, alert_type: str) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM company_alert_config WHERE alert_type = ?",
            (alert_type,),
        )
        return [dict(r) for r in rows]
