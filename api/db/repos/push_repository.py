from __future__ import annotations
import json
import time
from api.db.repos.base import BaseRepository


class PushRepository(BaseRepository):
    def save(self, player_id: int, endpoint: str, p256dh: str, auth: str, preferences: dict) -> int:
        now = int(time.time())
        prefs_json = json.dumps(preferences)
        return self.mutate("""
            INSERT INTO push_subscriptions (player_id, endpoint, p256dh, auth, preferences, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
                player_id = excluded.player_id,
                p256dh = excluded.p256dh,
                auth = excluded.auth,
                preferences = excluded.preferences,
                updated_at = excluded.updated_at
        """, (player_id, endpoint, p256dh, auth, prefs_json, now, now))

    def get_by_player(self, player_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM push_subscriptions WHERE player_id = ?", (player_id,))
        return [dict(r) for r in rows]

    def get_by_preference(self, event_type: str) -> list[dict]:
        """Get all subscriptions where the given event preference is true."""
        rows = self.execute("SELECT * FROM push_subscriptions")
        result = []
        for r in rows:
            d = dict(r)
            try:
                prefs = json.loads(d.get("preferences", "{}"))
            except (json.JSONDecodeError, TypeError):
                prefs = {}
            if prefs.get(event_type):
                result.append(d)
        return result

    def get_all_subscribers(self) -> list[dict]:
        rows = self.execute("SELECT * FROM push_subscriptions")
        return [dict(r) for r in rows]

    def get_by_player_and_preference(self, player_id: int, event_type: str) -> list[dict]:
        """Get subscriptions for a specific player where the event preference is true."""
        rows = self.execute(
            "SELECT * FROM push_subscriptions WHERE player_id = ?", (player_id,))
        result = []
        for r in rows:
            d = dict(r)
            try:
                prefs = json.loads(d.get("preferences", "{}"))
            except (json.JSONDecodeError, TypeError):
                prefs = {}
            if prefs.get(event_type):
                result.append(d)
        return result

    def update_preferences(self, player_id: int, preferences: dict) -> None:
        now = int(time.time())
        self.mutate("""
            UPDATE push_subscriptions SET preferences = ?, updated_at = ?
            WHERE player_id = ?
        """, (json.dumps(preferences), now, player_id))

    def delete_by_endpoint(self, endpoint: str) -> None:
        self.mutate("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
