from __future__ import annotations
import json
import time
from api.db.repos.base import BaseRepository


class NotificationRepository(BaseRepository):
    def create(self, type: str, title: str, message: str, data: dict | None = None) -> int:
        return self.mutate("""
            INSERT INTO notifications (type, title, message, data, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (type, title, message, json.dumps(data or {}), int(time.time())))

    def get_recent(self, limit: int = 50) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?", (limit,))
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["data"] = json.loads(d.get("data", "{}"))
            except (json.JSONDecodeError, TypeError):
                d["data"] = {}
            result.append(d)
        return result

    def get_unread_count(self) -> int:
        row = self.execute_one("SELECT COUNT(*) as cnt FROM notifications WHERE read = 0")
        return row["cnt"] if row else 0

    def mark_read(self, notification_id: int) -> None:
        self.mutate("UPDATE notifications SET read = 1 WHERE id = ?", (notification_id,))

    def mark_all_read(self) -> None:
        self.mutate("UPDATE notifications SET read = 1 WHERE read = 0")

    def cleanup(self, days: int = 30) -> int:
        cutoff = int(time.time()) - (days * 86400)
        conn = self._conn()
        cursor = conn.execute("DELETE FROM notifications WHERE created_at < ?", (cutoff,))
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        return deleted
