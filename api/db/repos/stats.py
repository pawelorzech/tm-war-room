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

    def get_all_latest(self) -> list[dict]:
        """Get the most recent snapshot for each player."""
        rows = self.execute("""
            SELECT s.* FROM stat_snapshots s
            INNER JOIN (SELECT player_id, MAX(snapshot_date) as max_date FROM stat_snapshots GROUP BY player_id) latest
            ON s.player_id = latest.player_id AND s.snapshot_date = latest.max_date
            ORDER BY s.total DESC
        """)
        return [dict(r) for r in rows]

    def get_growth(self, player_id: int, days: int = 30) -> dict | None:
        """Get stat growth over the last N days."""
        rows = self.execute(
            "SELECT * FROM stat_snapshots WHERE player_id = ? ORDER BY snapshot_date ASC",
            (player_id,),
        )
        if not rows:
            return None
        snaps = [dict(r) for r in rows]
        latest = snaps[-1]
        # Find snapshot closest to N days ago
        from datetime import date, timedelta
        cutoff = (date.today() - timedelta(days=days)).isoformat()
        older = [s for s in snaps if s["snapshot_date"] <= cutoff]
        baseline = older[-1] if older else snaps[0]
        actual_days = max(1, (date.fromisoformat(latest["snapshot_date"]) - date.fromisoformat(baseline["snapshot_date"])).days)
        return {
            "player_id": player_id,
            "from_date": baseline["snapshot_date"],
            "to_date": latest["snapshot_date"],
            "days": actual_days,
            "growth": {
                "strength": latest["strength"] - baseline["strength"],
                "defense": latest["defense"] - baseline["defense"],
                "speed": latest["speed"] - baseline["speed"],
                "dexterity": latest["dexterity"] - baseline["dexterity"],
                "total": latest["total"] - baseline["total"],
            },
            "per_day": {
                "strength": (latest["strength"] - baseline["strength"]) / actual_days,
                "defense": (latest["defense"] - baseline["defense"]) / actual_days,
                "speed": (latest["speed"] - baseline["speed"]) / actual_days,
                "dexterity": (latest["dexterity"] - baseline["dexterity"]) / actual_days,
                "total": (latest["total"] - baseline["total"]) / actual_days,
            },
        }
