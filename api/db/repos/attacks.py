from __future__ import annotations
from api.db.repos.base import BaseRepository


class AttackRepository(BaseRepository):
    def upsert_attack(self, attack: dict) -> None:
        conn = self._conn()
        conn.execute("""
            INSERT INTO attack_log (id, attacker_id, attacker_name, defender_id, defender_name,
                defender_faction_id, defender_faction_name, result, respect_gain, chain,
                is_ranked_war, is_raid, is_interrupted, started, ended, fair_fight, war_modifier, chain_modifier)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
        """, (
            attack["id"], attack["attacker_id"], attack.get("attacker_name"),
            attack["defender_id"], attack.get("defender_name"),
            attack.get("defender_faction_id"), attack.get("defender_faction_name"),
            attack["result"], attack.get("respect_gain", 0), attack.get("chain", 0),
            int(attack.get("is_ranked_war", False)), int(attack.get("is_raid", False)),
            int(attack.get("is_interrupted", False)),
            attack["started"], attack["ended"],
            attack.get("fair_fight", 1), attack.get("war_modifier", 1), attack.get("chain_modifier", 1),
        ))
        conn.commit()

    def bulk_upsert(self, attacks: list[dict]) -> int:
        conn = self._conn()
        inserted = 0
        for a in attacks:
            c = conn.execute("""
                INSERT INTO attack_log (id, attacker_id, attacker_name, defender_id, defender_name,
                    defender_faction_id, defender_faction_name, result, respect_gain, chain,
                    is_ranked_war, is_raid, is_interrupted, started, ended, fair_fight, war_modifier, chain_modifier)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
            """, (
                a["id"], a["attacker_id"], a.get("attacker_name"),
                a["defender_id"], a.get("defender_name"),
                a.get("defender_faction_id"), a.get("defender_faction_name"),
                a["result"], a.get("respect_gain", 0), a.get("chain", 0),
                int(a.get("is_ranked_war", False)), int(a.get("is_raid", False)),
                int(a.get("is_interrupted", False)),
                a["started"], a["ended"],
                a.get("fair_fight", 1), a.get("war_modifier", 1), a.get("chain_modifier", 1),
            ))
            if c.rowcount > 0:
                inserted += 1
        conn.commit()
        return inserted

    def get_chain_report(self, since: int = 0) -> list[dict]:
        """Get attack counts and respect per attacker since timestamp."""
        rows = self.execute("""
            SELECT attacker_id, attacker_name,
                   COUNT(*) as hits,
                   SUM(CASE WHEN result IN ('Hospitalized', 'Attacked') THEN 1 ELSE 0 END) as wins,
                   SUM(CASE WHEN result = 'Lost' THEN 1 ELSE 0 END) as losses,
                   SUM(respect_gain) as total_respect,
                   MAX(chain) as max_chain,
                   MAX(ended) as last_attack
            FROM attack_log
            WHERE started >= ?
            GROUP BY attacker_id
            ORDER BY total_respect DESC
        """, (since,))
        return [dict(r) for r in rows]

    def get_recent(self, limit: int = 50) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM attack_log ORDER BY started DESC LIMIT ?", (limit,)
        )
        return [dict(r) for r in rows]

    def get_war_report(self, enemy_faction_id: int, since: int = 0) -> dict:
        """Get war-specific stats against a faction."""
        our_attacks = self.execute("""
            SELECT attacker_id, attacker_name, COUNT(*) as hits,
                   SUM(respect_gain) as respect, SUM(CASE WHEN result IN ('Hospitalized','Attacked') THEN 1 ELSE 0 END) as wins
            FROM attack_log WHERE defender_faction_id = ? AND started >= ?
            GROUP BY attacker_id ORDER BY respect DESC
        """, (enemy_faction_id, since))
        their_attacks = self.execute("""
            SELECT attacker_id, attacker_name, COUNT(*) as hits,
                   SUM(respect_gain) as respect
            FROM attack_log WHERE defender_faction_id IS NOT NULL AND attacker_id NOT IN
                (SELECT DISTINCT attacker_id FROM attack_log WHERE defender_faction_id = ?)
            AND started >= ?
            GROUP BY attacker_id ORDER BY hits DESC
        """, (enemy_faction_id, since))
        return {
            "our_hits": [dict(r) for r in our_attacks],
            "their_hits": [dict(r) for r in their_attacks],
        }

    def get_activity_timeline(self, since: int = 0, bucket_seconds: int = 3600) -> list[dict]:
        """Get attack activity bucketed by time intervals."""
        rows = self.execute("""
            SELECT (started / ?) * ? as bucket_start,
                   COUNT(*) as hits,
                   SUM(respect_gain) as respect,
                   SUM(CASE WHEN result IN ('Hospitalized','Attacked') THEN 1 ELSE 0 END) as wins,
                   SUM(CASE WHEN result = 'Lost' THEN 1 ELSE 0 END) as losses,
                   COUNT(DISTINCT attacker_id) as active_members
            FROM attack_log
            WHERE started >= ?
            GROUP BY bucket_start
            ORDER BY bucket_start ASC
        """, (bucket_seconds, bucket_seconds, since))
        return [dict(r) for r in rows]

    def get_member_daily_stats(self, days: int = 7) -> list[dict]:
        """Per-member daily attack counts for the last N days."""
        import time
        since = int(time.time()) - (days * 86400)
        rows = self.execute("""
            SELECT attacker_id, attacker_name,
                   date(started, 'unixepoch') as day,
                   COUNT(*) as hits,
                   SUM(respect_gain) as respect,
                   SUM(CASE WHEN result IN ('Hospitalized','Attacked') THEN 1 ELSE 0 END) as wins
            FROM attack_log
            WHERE started >= ?
            GROUP BY attacker_id, day
            ORDER BY day ASC, respect DESC
        """, (since,))
        return [dict(r) for r in rows]

    def get_top_attackers(self, days: int = 7, limit: int = 20) -> list[dict]:
        """Top attackers by respect in last N days."""
        import time
        since = int(time.time()) - (days * 86400)
        rows = self.execute("""
            SELECT attacker_id, attacker_name,
                   COUNT(*) as total_hits,
                   SUM(respect_gain) as total_respect,
                   SUM(CASE WHEN result IN ('Hospitalized','Attacked') THEN 1 ELSE 0 END) as wins,
                   SUM(CASE WHEN result = 'Lost' THEN 1 ELSE 0 END) as losses,
                   COUNT(DISTINCT date(started, 'unixepoch')) as active_days
            FROM attack_log
            WHERE started >= ?
            GROUP BY attacker_id
            ORDER BY total_respect DESC
            LIMIT ?
        """, (since, limit))
        return [dict(r) for r in rows]

    def get_count(self) -> int:
        row = self.execute_one("SELECT COUNT(*) as cnt FROM attack_log")
        return row["cnt"] if row else 0

    def get_all_ordered(self, since_days: int = 90) -> list[dict]:
        """Attacks ordered by started ASC for chain detection (default: last 90 days)."""
        import time as _time
        cutoff = int(_time.time()) - since_days * 86400
        rows = self.execute(
            "SELECT * FROM attack_log WHERE started >= ? ORDER BY started ASC",
            (cutoff,),
        )
        return [dict(r) for r in rows]

    def get_attacks_in_range(self, start_ts: int, end_ts: int) -> list[dict]:
        """All attacks within a time range."""
        rows = self.execute(
            "SELECT * FROM attack_log WHERE started >= ? AND started <= ? ORDER BY started ASC",
            (start_ts, end_ts),
        )
        return [dict(r) for r in rows]

    def get_member_breakdown(self, start_ts: int, end_ts: int) -> list[dict]:
        """Per-member stats for attacks in a time range."""
        rows = self.execute("""
            SELECT attacker_id, attacker_name,
                   COUNT(*) as hits,
                   SUM(CASE WHEN result IN ('Hospitalized', 'Attacked') THEN 1 ELSE 0 END) as wins,
                   SUM(CASE WHEN result = 'Lost' THEN 1 ELSE 0 END) as losses,
                   SUM(respect_gain) as total_respect,
                   MAX(chain) as max_chain,
                   MIN(started) as first_attack,
                   MAX(ended) as last_attack
            FROM attack_log
            WHERE started >= ? AND started <= ?
            GROUP BY attacker_id
            ORDER BY total_respect DESC
        """, (start_ts, end_ts))
        return [dict(r) for r in rows]
