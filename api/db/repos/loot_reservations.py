from __future__ import annotations
from api.db.repos.base import BaseRepository


class LootReservationRepository(BaseRepository):
    def reserve(self, npc_id: int, npc_name: str, player_id: int,
                player_name: str | None, target_level: int = 4) -> None:
        self.mutate("""
            INSERT INTO loot_reservations (npc_id, npc_name, player_id, player_name, target_level)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(npc_id, player_id) DO UPDATE SET
                target_level = excluded.target_level,
                created_at = CURRENT_TIMESTAMP
        """, (npc_id, npc_name, player_id, player_name, target_level))

    def cancel(self, npc_id: int, player_id: int) -> None:
        self.mutate("DELETE FROM loot_reservations WHERE npc_id = ? AND player_id = ?",
                     (npc_id, player_id))

    def clear_npc(self, npc_id: int) -> None:
        """Clear all reservations for an NPC (e.g., when they go to hospital)."""
        self.mutate("DELETE FROM loot_reservations WHERE npc_id = ?", (npc_id,))

    def get_for_npc(self, npc_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM loot_reservations WHERE npc_id = ? ORDER BY target_level DESC, created_at ASC",
            (npc_id,))
        return [dict(r) for r in rows]

    def get_all(self) -> list[dict]:
        rows = self.execute("SELECT * FROM loot_reservations ORDER BY npc_id, target_level DESC")
        return [dict(r) for r in rows]

    def get_count(self) -> int:
        row = self.execute_one("SELECT COUNT(*) as cnt FROM loot_reservations")
        return row["cnt"] if row else 0
