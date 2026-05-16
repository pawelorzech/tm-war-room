from __future__ import annotations

from api.db.repos.base import BaseRepository


class ActivityRepository(BaseRepository):
    """Time-bucketed online activity + outsider enrollment.

    Phase 0 ships CRUD primitives only; bin size and refresh cadence are
    decided in Phase 3.
    """

    # ── activity_bins ─────────────────────────────────────────

    def add_bin(self, player_id: int, bin_start: int, online_seconds: int) -> None:
        """UPSERT: on conflict (player_id, bin_start), sum online_seconds.

        Idempotency win: a refresh job that re-emits the same bucket only
        adds the new delta, it doesn't overwrite the running total.
        """
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO activity_bins (player_id, bin_start, online_seconds)
            VALUES (?, ?, ?)
            ON CONFLICT(player_id, bin_start) DO UPDATE SET
                online_seconds = activity_bins.online_seconds + excluded.online_seconds
            """,
            (player_id, bin_start, online_seconds),
        )
        conn.commit()

    def bins_for(self, player_id: int, since: int) -> list[dict]:
        """All bins for player where bin_start >= since, oldest first."""
        rows = self.execute(
            "SELECT player_id, bin_start, online_seconds "
            "FROM activity_bins WHERE player_id = ? AND bin_start >= ? "
            "ORDER BY bin_start ASC",
            (player_id, since),
        )
        return [dict(r) for r in rows]

    def purge_old_bins(self, cutoff: int) -> int:
        """Drop bins older than cutoff. Returns number of rows deleted."""
        conn = self._conn()
        cur = conn.execute("DELETE FROM activity_bins WHERE bin_start < ?", (cutoff,))
        conn.commit()
        return cur.rowcount

    # ── activity_tracked_outsiders ─────────────────────────────

    def enroll_outsider(self, player_id: int, now: int) -> None:
        """Idempotent enrollment.

        Phase 3 contract: ``enrolled_at`` is set only on the first insert so the
        14-day purge anchor reflects when we *started* tracking the player —
        not the most recent profile view. Re-enrollment is a no-op; profile
        views still bump ``last_bin_at`` indirectly via the tick job.
        """
        conn = self._conn()
        conn.execute(
            """
            INSERT OR IGNORE INTO activity_tracked_outsiders
                (player_id, enrolled_at, last_bin_at)
            VALUES (?, ?, NULL)
            """,
            (player_id, now),
        )
        conn.commit()

    def tracked_outsiders(self) -> list[dict]:
        """All enrolled outsiders, newest enrollment first."""
        rows = self.execute(
            "SELECT player_id, enrolled_at, last_bin_at "
            "FROM activity_tracked_outsiders ORDER BY enrolled_at DESC"
        )
        return [dict(r) for r in rows]

    def update_last_bin(self, player_id: int, last_bin_at: int) -> None:
        """Bookkeeping hook for the Phase 3 refresh job."""
        self.mutate(
            "UPDATE activity_tracked_outsiders SET last_bin_at = ? WHERE player_id = ?",
            (last_bin_at, player_id),
        )

    # Phase 3A naming alias — callers reading the spec expect this name.
    def update_outsider_last_bin(self, player_id: int, last_bin_at: int) -> None:
        self.update_last_bin(player_id, last_bin_at)

    def purge_idle_outsiders(self, now: int, idle_seconds: int) -> int:
        """Drop outsiders whose last_bin_at is older than (now - idle_seconds).

        Rows that were never observed (last_bin_at IS NULL) are evaluated
        against enrolled_at instead — a player nobody has activity-pinged on
        for `idle_seconds` after enrollment is dropped. Returns rows deleted.
        """
        cutoff = now - idle_seconds
        conn = self._conn()
        cur = conn.execute(
            """
            DELETE FROM activity_tracked_outsiders
            WHERE COALESCE(last_bin_at, enrolled_at) < ?
            """,
            (cutoff,),
        )
        conn.commit()
        return cur.rowcount
