from __future__ import annotations
import time
from api.db.repos.base import BaseRepository


class PresenceRepository(BaseRepository):

    def heartbeat(self, player_id: int) -> None:
        self.mutate(
            """INSERT INTO player_presence (player_id, last_seen)
               VALUES (?, ?)
               ON CONFLICT(player_id) DO UPDATE SET last_seen = excluded.last_seen""",
            (player_id, int(time.time())),
        )

    def get_online(self, ttl_seconds: int = 120) -> list[int]:
        cutoff = int(time.time()) - ttl_seconds
        rows = self.execute(
            "SELECT player_id FROM player_presence WHERE last_seen > ?", (cutoff,)
        )
        return [r[0] for r in rows]
