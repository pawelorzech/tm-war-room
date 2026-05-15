from __future__ import annotations
from api.db.repos.base import BaseRepository


class WarOffLimitsRepository(BaseRepository):
    """Per-war 'off-limits' flags on enemy players.

    Ownership: each row has set_by/set_by_name. Mutations enforce that the
    caller either matches set_by or is an admin (enforced in the router).
    """

    def list_for_war(self, war_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM war_off_limits WHERE war_id = ? ORDER BY created_at DESC",
            (war_id,),
        )
        return [dict(r) for r in rows]

    def get(self, war_id: int, player_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM war_off_limits WHERE war_id = ? AND player_id = ?",
            (war_id, player_id),
        )
        return dict(row) if row else None

    def add(
        self,
        war_id: int,
        player_id: int,
        player_name: str,
        set_by: int,
        set_by_name: str,
        reason: str = "",
    ) -> bool:
        """Insert a new flag. Returns False if (war_id, player_id) already exists."""
        existing = self.get(war_id, player_id)
        if existing is not None:
            return False
        self.mutate(
            """
            INSERT INTO war_off_limits
                (war_id, player_id, player_name, set_by, set_by_name, reason)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (war_id, player_id, player_name, set_by, set_by_name, reason or ""),
        )
        return True

    def update_reason(self, war_id: int, player_id: int, reason: str) -> bool:
        """Update reason only; returns True if a row was updated."""
        before = self.get(war_id, player_id)
        if before is None:
            return False
        self.mutate(
            """
            UPDATE war_off_limits
            SET reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE war_id = ? AND player_id = ?
            """,
            (reason or "", war_id, player_id),
        )
        return True

    def delete(self, war_id: int, player_id: int) -> bool:
        before = self.get(war_id, player_id)
        if before is None:
            return False
        self.mutate(
            "DELETE FROM war_off_limits WHERE war_id = ? AND player_id = ?",
            (war_id, player_id),
        )
        return True
