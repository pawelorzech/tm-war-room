from __future__ import annotations

from api.db.repos.base import BaseRepository


class ClaimRepository(BaseRepository):
    """Hit claims on enemy targets. At most one `active` claim per target_id.

    Schema-level constraint: hit_claims.target_id is the PRIMARY KEY, so a
    target can only ever have a single row. State transitions therefore happen
    in-place via UPDATE rather than by inserting new rows.
    """

    # ── reads ───────────────────────────────────────────────────

    def get(self, target_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT target_id, claimer_id, claimed_at, expires_at, status, note "
            "FROM hit_claims WHERE target_id = ?",
            (target_id,),
        )
        return dict(row) if row else None

    def active_claims(self) -> list[dict]:
        rows = self.execute(
            "SELECT target_id, claimer_id, claimed_at, expires_at, status, note "
            "FROM hit_claims WHERE status = 'active' "
            "ORDER BY claimed_at DESC"
        )
        return [dict(r) for r in rows]

    # ── writes ──────────────────────────────────────────────────

    def claim(
        self,
        target_id: int,
        claimer_id: int,
        now: int,
        ttl_seconds: int,
        note: str | None = None,
    ) -> tuple[str, dict]:
        """Atomically attempt to claim a target.

        Returns ("ok", new_row) when the claim took, or ("conflict", existing_row)
        when there is already an `active` claim. The atomicity guarantee comes
        from a single SQL statement: the INSERT … WHERE NOT EXISTS sub-pattern
        is replaced by an INSERT … ON CONFLICT DO UPDATE that only mutates
        non-active rows, then a follow-up SELECT confirms which case won.
        """
        conn = self._conn()
        cur = conn.execute(
            """
            INSERT INTO hit_claims
                (target_id, claimer_id, claimed_at, expires_at, status, note)
            VALUES (?, ?, ?, ?, 'active', ?)
            ON CONFLICT(target_id) DO UPDATE SET
                claimer_id = excluded.claimer_id,
                claimed_at = excluded.claimed_at,
                expires_at = excluded.expires_at,
                status = 'active',
                note = excluded.note
            WHERE hit_claims.status != 'active'
               OR hit_claims.expires_at <= excluded.claimed_at
            """,
            (target_id, claimer_id, now, now + ttl_seconds, note),
        )
        conn.commit()
        row = self.get(target_id)
        if row is None:
            # Should not happen — the INSERT side always lands a row.
            return ("conflict", {})  # pragma: no cover
        if cur.rowcount > 0 and row["claimer_id"] == claimer_id and row["status"] == "active":
            return ("ok", row)
        return ("conflict", row)

    def release(self, target_id: int, claimer_id: int, now: int) -> bool:
        """Mark an active claim as released. Returns True iff caller owns it."""
        conn = self._conn()
        cur = conn.execute(
            """
            UPDATE hit_claims SET status = 'released'
            WHERE target_id = ? AND claimer_id = ? AND status = 'active'
            """,
            (target_id, claimer_id),
        )
        conn.commit()
        # `now` is accepted for API symmetry with claim()/mark_hit(); not stored
        # because release timestamp isn't part of the Phase 0 schema. Phases
        # 4+ can add a `released_at` column if reporting needs it.
        _ = now
        return cur.rowcount > 0

    def mark_hit(self, target_id: int, claimer_id: int, now: int) -> bool:
        """Mark an active claim as a successful hit. Returns True iff updated."""
        conn = self._conn()
        cur = conn.execute(
            """
            UPDATE hit_claims SET status = 'hit'
            WHERE target_id = ? AND claimer_id = ? AND status = 'active'
            """,
            (target_id, claimer_id),
        )
        conn.commit()
        _ = now
        return cur.rowcount > 0

    def expire_stale(self, now: int) -> list[dict]:
        """Flip active claims whose TTL has elapsed to 'expired'.

        Returns the rows that were flipped (each as a dict matching ``get()``).
        The sweeper needs the rows themselves — not just a count — so it can
        publish a ``claim.expired`` event per row over the pub/sub channel.

        Implementation: snapshot the IDs first (inside the same connection so
        we see a consistent view), then UPDATE in one statement, then re-read
        each row. Cheap because the partial index ``ix_hit_claims_active``
        keeps the SELECT small even on a populated faction.
        """
        conn = self._conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            stale_rows = conn.execute(
                """
                SELECT target_id, claimer_id, claimed_at, expires_at, status, note
                FROM hit_claims
                WHERE status = 'active' AND expires_at <= ?
                """,
                (now,),
            ).fetchall()
            if not stale_rows:
                conn.commit()
                return []
            target_ids = [r["target_id"] for r in stale_rows]
            placeholders = ",".join("?" * len(target_ids))
            conn.execute(
                f"UPDATE hit_claims SET status = 'expired' "
                f"WHERE status = 'active' AND target_id IN ({placeholders})",
                tuple(target_ids),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        # Return rows with the new status — callers (sweeper) inject `expired`
        # into the published event envelope.
        return [
            {
                "target_id": r["target_id"],
                "claimer_id": r["claimer_id"],
                "claimed_at": r["claimed_at"],
                "expires_at": r["expires_at"],
                "status": "expired",
                "note": r["note"],
            }
            for r in stale_rows
        ]

    def active_claims_for_faction(self, faction_member_ids: list[int]) -> list[dict]:
        """Return active claims where the claimer is in ``faction_member_ids``.

        We don't store a faction_id on hit_claims (claimers are always TM
        members — registration enforces this), so the caller passes the list
        of player_ids to filter on. Empty input → empty result without
        round-tripping to SQLite.
        """
        if not faction_member_ids:
            return []
        placeholders = ",".join("?" * len(faction_member_ids))
        rows = self.execute(
            f"SELECT target_id, claimer_id, claimed_at, expires_at, status, note "
            f"FROM hit_claims "
            f"WHERE status = 'active' AND claimer_id IN ({placeholders}) "
            f"ORDER BY claimed_at DESC",
            tuple(faction_member_ids),
        )
        return [dict(r) for r in rows]
