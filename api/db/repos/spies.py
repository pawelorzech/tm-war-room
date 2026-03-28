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

    def get_all_estimates(self) -> list[dict]:
        rows = self.execute("SELECT * FROM spy_estimates ORDER BY total DESC")
        return [dict(r) for r in rows]
