from __future__ import annotations
import json
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


class NotificationEventRepository(BaseRepository):
    def create_event(
        self,
        template_id: int | None,
        title: str,
        body: str,
        url: str | None,
        icon: str | None,
        target_type: str,
        target_value: str | None,
        sent_by: str,
        variables_used: dict,
    ) -> int:
        now = datetime.now(timezone.utc).isoformat()
        return self.mutate(
            """INSERT INTO notification_events
               (template_id, title, body, url, icon, target_type, target_value, sent_by, variables_used, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (template_id, title, body, url, icon, target_type, target_value,
             sent_by, json.dumps(variables_used), now),
        )

    def get_event(self, event_id: int) -> dict | None:
        row = self.execute_one("SELECT * FROM notification_events WHERE id = ?", (event_id,))
        return dict(row) if row else None

    def list_events(self, limit: int = 20, offset: int = 0) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM notification_events ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        return [dict(r) for r in rows]

    def create_delivery(self, event_id: int, player_id: int, channel: str) -> int:
        now = datetime.now(timezone.utc).isoformat()
        return self.mutate(
            """INSERT INTO delivery_log (event_id, player_id, channel, status, created_at)
               VALUES (?, ?, ?, 'pending', ?)""",
            (event_id, player_id, channel, now),
        )

    def mark_delivered(self, delivery_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.mutate(
            "UPDATE delivery_log SET status = 'delivered', delivered_at = ? WHERE id = ?",
            (now, delivery_id),
        )

    def mark_failed(self, delivery_id: int, error: str) -> None:
        self.mutate(
            "UPDATE delivery_log SET status = 'failed', error_message = ? WHERE id = ?",
            (error, delivery_id),
        )

    def get_pending_pda(self, player_id: int) -> list[dict]:
        """Get pending PDA deliveries with event data, last 24h."""
        rows = self.execute(
            """SELECT d.id as delivery_id, e.id as event_id, e.title, e.body, e.url, e.icon, e.created_at
               FROM delivery_log d
               JOIN notification_events e ON d.event_id = e.id
               WHERE d.player_id = ? AND d.channel = 'pda' AND d.status = 'pending'
                 AND d.created_at >= datetime('now', '-1 day')
               ORDER BY d.created_at ASC""",
            (player_id,),
        )
        return [dict(r) for r in rows]

    def get_deliveries_for_event(self, event_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM delivery_log WHERE event_id = ? ORDER BY id",
            (event_id,),
        )
        return [dict(r) for r in rows]

    def get_event_stats(self, event_id: int) -> dict:
        rows = self.execute(
            """SELECT status, COUNT(*) as cnt FROM delivery_log
               WHERE event_id = ? GROUP BY status""",
            (event_id,),
        )
        stats = {"delivered": 0, "pending": 0, "failed": 0, "expired": 0}
        for r in rows:
            stats[r["status"]] = r["cnt"]
        return stats

    def get_subscription_stats(self) -> dict:
        """Count subscriptions per channel."""
        rows = self.execute(
            "SELECT channel, COUNT(*) as cnt FROM push_subscriptions GROUP BY channel"
        )
        return {r["channel"]: r["cnt"] for r in rows}
