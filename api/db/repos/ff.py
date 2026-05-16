from __future__ import annotations

from api.db.repos.base import BaseRepository


class FFRepository(BaseRepository):
    """Cached fair-fight scores (one row per player_id).

    Phase 0 ships CRUD primitives only — score computation lives in Phase 1.
    """

    def get(self, player_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT player_id, score, dom_stat, computed_at, expires_at, source "
            "FROM ff_scores WHERE player_id = ?",
            (player_id,),
        )
        return dict(row) if row else None

    def upsert(
        self,
        player_id: int,
        score: float,
        dom_stat: str,
        source: str,
        ttl_seconds: int,
        *,
        now: int,
    ) -> None:
        """Upsert a score with explicit TTL. `now` is the epoch second to use
        for both computed_at and as the base for expires_at — caller-supplied
        so tests can pin time without monkeypatching."""
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO ff_scores (player_id, score, dom_stat, computed_at, expires_at, source)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id) DO UPDATE SET
                score = excluded.score,
                dom_stat = excluded.dom_stat,
                computed_at = excluded.computed_at,
                expires_at = excluded.expires_at,
                source = excluded.source
            """,
            (player_id, score, dom_stat, now, now + ttl_seconds, source),
        )
        conn.commit()

    def purge_expired(self, now: int) -> int:
        """Delete rows whose expires_at <= now. Returns number of rows removed."""
        conn = self._conn()
        cur = conn.execute("DELETE FROM ff_scores WHERE expires_at <= ?", (now,))
        conn.commit()
        return cur.rowcount
