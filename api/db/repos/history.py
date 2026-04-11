from __future__ import annotations
import time
from datetime import date
from api.db.repos.base import BaseRepository


class HistoryRepository(BaseRepository):
    def record_stock_price(self, stock_id: int, price: float) -> None:
        now = int(time.time())
        self.mutate("""
            INSERT OR IGNORE INTO stock_history (stock_id, price, recorded_at)
            VALUES (?, ?, ?)
        """, (stock_id, price, now))

    def record_stock_prices_bulk(self, prices: list[tuple[int, float]]) -> int:
        now = int(time.time())
        conn = self._conn()
        inserted = 0
        for stock_id, price in prices:
            try:
                conn.execute("""
                    INSERT OR IGNORE INTO stock_history (stock_id, price, recorded_at)
                    VALUES (?, ?, ?)
                """, (stock_id, price, now))
                inserted += 1
            except Exception:
                pass
        conn.commit()
        return inserted

    def get_stock_history(self, stock_id: int, days: int = 30) -> list[dict]:
        since = int(time.time()) - (days * 86400)
        rows = self.execute("""
            SELECT price, recorded_at FROM stock_history
            WHERE stock_id = ? AND recorded_at >= ?
            ORDER BY recorded_at ASC
        """, (stock_id, since))
        return [dict(r) for r in rows]

    def record_activity_snapshot(self, total: int, online: int, hospital: int, traveling: int) -> None:
        today = date.today().isoformat()
        now = int(time.time())
        self.mutate("""
            INSERT INTO member_activity_log (snapshot_date, total_members, online_count, hospital_count, traveling_count, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(snapshot_date) DO UPDATE SET
                total_members = excluded.total_members,
                online_count = MAX(member_activity_log.online_count, excluded.online_count),
                hospital_count = excluded.hospital_count,
                traveling_count = excluded.traveling_count,
                recorded_at = excluded.recorded_at
        """, (today, total, online, hospital, traveling, now))

    def get_activity_history(self, days: int = 30) -> list[dict]:
        rows = self.execute("""
            SELECT * FROM member_activity_log
            ORDER BY snapshot_date DESC LIMIT ?
        """, (days,))
        return [dict(r) for r in rows]

    def cleanup_old_data(self, days: int = 90) -> int:
        cutoff = int(time.time()) - (days * 86400)
        conn = self._conn()
        cursor = conn.execute("DELETE FROM stock_history WHERE recorded_at < ?", (cutoff,))
        deleted = cursor.rowcount
        conn.commit()
        return deleted
