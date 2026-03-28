from __future__ import annotations
from api.db.repos.base import BaseRepository

class StatSnapshotRepository(BaseRepository):
    def insert_snapshot(self, player_id: int, snapshot_date: str,
                        strength: float, defense: float, speed: float, dexterity: float,
                        total: float, level: int | None = None, xanax_taken: int | None = None,
                        refills: int | None = None, energy_drinks: int | None = None,
                        networth: float | None = None) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO stat_snapshots (player_id, snapshot_date, strength, defense, speed, dexterity, total, level, xanax_taken, refills, energy_drinks, networth)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, snapshot_date) DO NOTHING
        """, (player_id, snapshot_date, strength, defense, speed, dexterity, total, level, xanax_taken, refills, energy_drinks, networth))
        conn.commit()
        conn.close()

    def get_snapshots(self, player_id: int, limit: int = 365) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM stat_snapshots WHERE player_id = ? ORDER BY snapshot_date ASC LIMIT ?",
            (player_id, limit),
        )
        return [dict(r) for r in rows]

    def get_latest_snapshot(self, player_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM stat_snapshots WHERE player_id = ? ORDER BY snapshot_date DESC LIMIT 1",
            (player_id,),
        )
        return dict(row) if row else None
