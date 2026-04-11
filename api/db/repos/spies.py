from __future__ import annotations
from api.db.repos.base import BaseRepository

class SpyRepository(BaseRepository):
    def upsert_report(self, player_id: int, player_name: str | None, source: str,
                      strength: float, defense: float, speed: float, dexterity: float,
                      total: float, confidence: str, reported_at: str) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO spy_reports (player_id, player_name, source, strength, defense, speed, dexterity, total, confidence, reported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, source, reported_at) DO UPDATE SET
                player_name = excluded.player_name,
                strength = excluded.strength, defense = excluded.defense,
                speed = excluded.speed, dexterity = excluded.dexterity,
                total = excluded.total, confidence = excluded.confidence,
                fetched_at = CURRENT_TIMESTAMP
        """, (player_id, player_name, source, strength, defense, speed, dexterity, total, confidence, reported_at))
        conn.commit()
        conn.close()

    def get_reports(self, player_id: int) -> list[dict]:
        rows = self.execute("SELECT * FROM spy_reports WHERE player_id = ? ORDER BY reported_at DESC", (player_id,))
        return [dict(r) for r in rows]

    def update_estimate(self, player_id: int, player_name: str | None, source: str,
                        strength: float, defense: float, speed: float, dexterity: float,
                        total: float, confidence: str, reported_at: str) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO spy_estimates (player_id, player_name, strength, defense, speed, dexterity, total, confidence, source, reported_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(player_id) DO UPDATE SET
                player_name = excluded.player_name, strength = excluded.strength,
                defense = excluded.defense, speed = excluded.speed, dexterity = excluded.dexterity,
                total = excluded.total, confidence = excluded.confidence,
                source = excluded.source, reported_at = excluded.reported_at, updated_at = CURRENT_TIMESTAMP
        """, (player_id, player_name, strength, defense, speed, dexterity, total, confidence, source, reported_at))
        conn.commit()
        conn.close()

    def get_estimate(self, player_id: int) -> dict | None:
        row = self.execute_one("SELECT * FROM spy_estimates WHERE player_id = ?", (player_id,))
        return dict(row) if row else None

    def get_estimates_bulk(self, player_ids: list[int]) -> dict[int, dict]:
        if not player_ids:
            return {}
        placeholders = ",".join("?" * len(player_ids))
        rows = self.execute(
            f"SELECT * FROM spy_estimates WHERE player_id IN ({placeholders})",
            tuple(player_ids),
        )
        return {r["player_id"]: dict(r) for r in rows}

    def get_all_estimates(self) -> list[dict]:
        rows = self.execute("SELECT * FROM spy_estimates ORDER BY total DESC")
        return [dict(r) for r in rows]

    def delete_estimate(self, player_id: int) -> bool:
        conn = self._conn()
        c1 = conn.execute("DELETE FROM spy_estimates WHERE player_id = ?", (player_id,))
        conn.execute("DELETE FROM spy_reports WHERE player_id = ?", (player_id,))
        conn.commit()
        deleted = c1.rowcount > 0
        conn.close()
        return deleted

    def is_blocked(self, player_id: int) -> bool:
        row = self.execute_one("SELECT 1 FROM spy_blocked WHERE player_id = ?", (player_id,))
        return row is not None

    def block_player(self, player_id: int, blocked_by: int, reason: str | None = None) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT OR REPLACE INTO spy_blocked (player_id, reason, blocked_by) VALUES (?, ?, ?)",
            (player_id, reason, blocked_by),
        )
        # Also remove existing data
        conn.execute("DELETE FROM spy_estimates WHERE player_id = ?", (player_id,))
        conn.execute("DELETE FROM spy_reports WHERE player_id = ?", (player_id,))
        conn.commit()
        conn.close()

    def unblock_player(self, player_id: int) -> bool:
        conn = self._conn()
        c = conn.execute("DELETE FROM spy_blocked WHERE player_id = ?", (player_id,))
        conn.commit()
        removed = c.rowcount > 0
        conn.close()
        return removed

    def get_blocked(self) -> list[dict]:
        rows = self.execute("SELECT * FROM spy_blocked ORDER BY blocked_at DESC")
        return [dict(r) for r in rows]

    def is_hidden(self, player_id: int) -> bool:
        row = self.execute_one("SELECT 1 FROM spy_hidden WHERE player_id = ?", (player_id,))
        return row is not None

    def hide_player(self, player_id: int, hidden_by: int) -> None:
        conn = self._conn()
        conn.execute("INSERT OR REPLACE INTO spy_hidden (player_id, hidden_by) VALUES (?, ?)", (player_id, hidden_by))
        conn.commit()
        conn.close()

    def unhide_player(self, player_id: int) -> bool:
        conn = self._conn()
        c = conn.execute("DELETE FROM spy_hidden WHERE player_id = ?", (player_id,))
        conn.commit()
        removed = c.rowcount > 0
        conn.close()
        return removed

    def get_hidden_ids(self) -> set[int]:
        rows = self.execute("SELECT player_id FROM spy_hidden")
        return {r["player_id"] for r in rows}

    def get_hidden(self) -> list[dict]:
        rows = self.execute("SELECT * FROM spy_hidden ORDER BY hidden_at DESC")
        return [dict(r) for r in rows]
