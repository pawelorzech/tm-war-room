from __future__ import annotations
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


class VersionDismissalRepository(BaseRepository):
    def is_dismissed(self, player_id: int, version: str) -> bool:
        row = self.execute_one(
            "SELECT 1 FROM version_dismissals WHERE player_id = ? AND version = ?",
            (player_id, version),
        )
        return row is not None

    def dismiss(self, player_id: int, version: str) -> None:
        self.mutate(
            """INSERT INTO version_dismissals (player_id, version, dismissed_at)
               VALUES (?, ?, ?)
               ON CONFLICT(player_id, version) DO NOTHING""",
            (player_id, version, datetime.now(timezone.utc).isoformat()),
        )
