from __future__ import annotations
import time
from datetime import date
from api.db.repos.base import BaseRepository


class CirculationRepository(BaseRepository):
    def record_snapshot(self, award_id: int, award_type: str, circulation: int) -> None:
        today = date.today().isoformat()
        now = int(time.time())
        self.mutate("""
            INSERT INTO award_circulation_history (award_id, award_type, circulation, snapshot_date, recorded_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(award_id, award_type, snapshot_date) DO UPDATE SET
                circulation = excluded.circulation,
                recorded_at = excluded.recorded_at
        """, (award_id, award_type, circulation, today, now))

    def bulk_record(self, records: list[tuple[int, str, int]]) -> None:
        """Record multiple snapshots. records = [(award_id, award_type, circulation), ...]"""
        today = date.today().isoformat()
        now = int(time.time())
        conn = self._conn()
        for award_id, award_type, circulation in records:
            conn.execute("""
                INSERT INTO award_circulation_history (award_id, award_type, circulation, snapshot_date, recorded_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(award_id, award_type, snapshot_date) DO UPDATE SET
                    circulation = excluded.circulation,
                    recorded_at = excluded.recorded_at
            """, (award_id, award_type, circulation, today, now))
        conn.commit()
        conn.close()

    def get_history(self, award_id: int, award_type: str, days: int = 30) -> list[dict]:
        rows = self.execute("""
            SELECT snapshot_date, circulation
            FROM award_circulation_history
            WHERE award_id = ? AND award_type = ?
            ORDER BY snapshot_date DESC
            LIMIT ?
        """, (award_id, award_type, days))
        return [dict(r) for r in rows]
