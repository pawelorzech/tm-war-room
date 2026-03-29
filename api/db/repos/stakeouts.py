from __future__ import annotations
from api.db.repos.base import BaseRepository


class StakeoutRepository(BaseRepository):
    def add(self, player_id: int, player_name: str | None, added_by: int, notes: str = '') -> None:
        self.mutate("""
            INSERT INTO stakeouts (player_id, player_name, added_by, notes)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(player_id) DO UPDATE SET notes = excluded.notes
        """, (player_id, player_name, added_by, notes))

    def remove(self, player_id: int) -> None:
        self.mutate("DELETE FROM stakeouts WHERE player_id = ?", (player_id,))

    def get_all(self) -> list[dict]:
        rows = self.execute("SELECT * FROM stakeouts ORDER BY last_change DESC")
        return [dict(r) for r in rows]

    def update_status(self, player_id: int, status: str, last_action: str, player_name: str | None = None) -> bool:
        """Update player status. Returns True if status CHANGED."""
        current = self.execute_one("SELECT last_status FROM stakeouts WHERE player_id = ?", (player_id,))
        if not current:
            return False
        old_status = current["last_status"]
        changed = old_status != status
        import time
        now = int(time.time())
        if player_name:
            self.mutate("""
                UPDATE stakeouts SET last_status = ?, last_action = ?, last_checked = ?,
                    player_name = ?, last_change = CASE WHEN last_status != ? THEN ? ELSE last_change END
                WHERE player_id = ?
            """, (status, last_action, now, player_name, status, now, player_id))
        else:
            self.mutate("""
                UPDATE stakeouts SET last_status = ?, last_action = ?, last_checked = ?,
                    last_change = CASE WHEN last_status != ? THEN ? ELSE last_change END
                WHERE player_id = ?
            """, (status, last_action, now, status, now, player_id))
        return changed

    def get_count(self) -> int:
        row = self.execute_one("SELECT COUNT(*) as cnt FROM stakeouts")
        return row["cnt"] if row else 0
