from __future__ import annotations
from api.db.repos.base import BaseRepository

class StatSnapshotRepository(BaseRepository):
    def insert_snapshot(self, player_id: int, snapshot_date: str,
                        strength: float, defense: float, speed: float, dexterity: float,
                        total: float, level: int | None = None, xanax_taken: int | None = None,
                        refills: int | None = None, energy_drinks: int | None = None,
                        networth: float | None = None, gym_trains: int | None = None,
                        stat_enhancers_used: int | None = None,
                        easter_eggs: int | None = None,
                        gym_energy: int | None = None) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO stat_snapshots (player_id, snapshot_date, strength, defense, speed, dexterity, total,
                                        level, xanax_taken, refills, energy_drinks, networth,
                                        gym_trains, stat_enhancers_used, easter_eggs, gym_energy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, snapshot_date) DO UPDATE SET
                strength=excluded.strength, defense=excluded.defense, speed=excluded.speed,
                dexterity=excluded.dexterity, total=excluded.total, level=excluded.level,
                xanax_taken=excluded.xanax_taken, refills=excluded.refills,
                energy_drinks=excluded.energy_drinks, networth=excluded.networth,
                gym_trains=excluded.gym_trains, stat_enhancers_used=excluded.stat_enhancers_used,
                easter_eggs=excluded.easter_eggs, gym_energy=excluded.gym_energy
        """, (player_id, snapshot_date, strength, defense, speed, dexterity, total, level,
              xanax_taken, refills, energy_drinks, networth, gym_trains, stat_enhancers_used, easter_eggs,
              gym_energy))
        conn.commit()

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

    def get_all_growth(self, days: int = 30) -> list[dict]:
        """Get stat growth for ALL players over the last N days."""
        from datetime import date, timedelta
        cutoff = (date.today() - timedelta(days=days)).isoformat()
        today = date.today().isoformat()
        # Get the earliest snapshot on or after cutoff and the latest snapshot for each player
        rows = self.execute("""
            SELECT
                s1.player_id,
                s1.snapshot_date AS from_date,
                s2.snapshot_date AS to_date,
                s2.strength - s1.strength AS str_growth,
                s2.defense - s1.defense AS def_growth,
                s2.speed - s1.speed AS spd_growth,
                s2.dexterity - s1.dexterity AS dex_growth,
                s2.total - s1.total AS total_growth,
                s1.total AS start_total,
                s2.total AS end_total,
                COALESCE(s2.xanax_taken, 0) - COALESCE(s1.xanax_taken, 0) AS xanax_delta,
                COALESCE(s2.refills, 0) - COALESCE(s1.refills, 0) AS refills_delta,
                COALESCE(s2.energy_drinks, 0) - COALESCE(s1.energy_drinks, 0) AS energy_drinks_delta,
                COALESCE(s2.stat_enhancers_used, 0) - COALESCE(s1.stat_enhancers_used, 0) AS se_delta,
                COALESCE(s2.easter_eggs, 0) - COALESCE(s1.easter_eggs, 0) AS easter_eggs_delta,
                s2.gym_energy AS end_gym_energy,
                s1.gym_energy AS start_gym_energy
            FROM (
                SELECT * FROM stat_snapshots s
                INNER JOIN (SELECT player_id, MIN(snapshot_date) as min_date FROM stat_snapshots WHERE snapshot_date >= ? GROUP BY player_id) m
                ON s.player_id = m.player_id AND s.snapshot_date = m.min_date
            ) s1
            INNER JOIN (
                SELECT * FROM stat_snapshots s
                INNER JOIN (SELECT player_id, MAX(snapshot_date) as max_date FROM stat_snapshots GROUP BY player_id) m
                ON s.player_id = m.player_id AND s.snapshot_date = m.max_date
            ) s2
            ON s1.player_id = s2.player_id
            WHERE s1.snapshot_date != s2.snapshot_date
            ORDER BY total_growth DESC
        """, (cutoff,))
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
