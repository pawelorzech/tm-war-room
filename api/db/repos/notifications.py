from __future__ import annotations
import json
import time
from api.db.repos.base import BaseRepository


class NotificationRepository(BaseRepository):
    def create(self, player_id: int, type: str, title: str, message: str, data: dict | None = None) -> int:
        return self.mutate("""
            INSERT INTO notifications (player_id, type, title, message, data, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (player_id, type, title, message, json.dumps(data or {}), int(time.time())))

    def get_recent(self, player_id: int, limit: int = 50) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM notifications WHERE player_id = ? ORDER BY created_at DESC LIMIT ?",
            (player_id, limit),
        )
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["data"] = json.loads(d.get("data", "{}"))
            except (json.JSONDecodeError, TypeError):
                d["data"] = {}
            result.append(d)
        return result

    def get_unread_count(self, player_id: int) -> int:
        row = self.execute_one("SELECT COUNT(*) as cnt FROM notifications WHERE player_id = ? AND read = 0", (player_id,))
        return row["cnt"] if row else 0

    def mark_read(self, player_id: int, notification_id: int) -> None:
        self.mutate("UPDATE notifications SET read = 1 WHERE id = ? AND player_id = ?", (notification_id, player_id))

    def mark_all_read(self, player_id: int) -> None:
        self.mutate("UPDATE notifications SET read = 1 WHERE player_id = ? AND read = 0", (player_id,))

    def cleanup(self, days: int = 30) -> int:
        cutoff = int(time.time()) - (days * 86400)
        conn = self._conn()
        cursor = conn.execute("DELETE FROM notifications WHERE created_at < ?", (cutoff,))
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        return deleted
