from __future__ import annotations

import time

from api.db.repos.base import BaseRepository


class PinnedWeeksRepository(BaseRepository):
    """User-pinned weeks for comparison overlays (e.g. 'Halloween 2025')."""

    def list_for(self, player_id: int, company_id: int | None = None) -> list[dict]:
        if company_id is None:
            rows = self.execute(
                "SELECT * FROM pinned_weeks WHERE player_id = ? ORDER BY week_start_ts DESC",
                (player_id,),
            )
        else:
            rows = self.execute(
                """
                SELECT * FROM pinned_weeks
                WHERE player_id = ? AND company_id = ?
                ORDER BY week_start_ts DESC
                """,
                (player_id, company_id),
            )
        return [dict(r) for r in rows]

    def create(
        self,
        *,
        player_id: int,
        company_id: int,
        week_start_ts: int,
        label: str,
        note: str | None = None,
    ) -> int:
        now = int(time.time())
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO pinned_weeks (player_id, company_id, week_start_ts, label, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, company_id, week_start_ts) DO UPDATE SET
                label = excluded.label,
                note = excluded.note
            """,
            (player_id, company_id, week_start_ts, label, note, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id FROM pinned_weeks WHERE player_id = ? AND company_id = ? AND week_start_ts = ?",
            (player_id, company_id, week_start_ts),
        ).fetchone()
        return row[0] if row else 0

    def delete(self, player_id: int, pinned_id: int) -> bool:
        conn = self._conn()
        cur = conn.execute(
            "DELETE FROM pinned_weeks WHERE id = ? AND player_id = ?",
            (pinned_id, player_id),
        )
        conn.commit()
        return cur.rowcount > 0

    def get(self, player_id: int, pinned_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM pinned_weeks WHERE id = ? AND player_id = ?",
            (pinned_id, player_id),
        )
        return dict(row) if row else None
