from __future__ import annotations

from api.db.repos.base import BaseRepository


class FlightRepository(BaseRepository):
    """Per-player travel events. A flight is `active` while landed_at IS NULL."""

    def record_event(
        self,
        player_id: int,
        departed_at: int,
        destination: str,
        ticket_class: str,
        source: str,
        *,
        observed_at: int,
    ) -> int:
        """Insert a new departure. Returns the inserted row id."""
        return self.mutate(
            """
            INSERT INTO flight_events
                (player_id, departed_at, destination, ticket_class, landed_at, observed_at, source)
            VALUES (?, ?, ?, ?, NULL, ?, ?)
            """,
            (player_id, departed_at, destination, ticket_class, observed_at, source),
        )

    def mark_landed(self, event_id: int, landed_at: int) -> bool:
        """Mark a flight as completed. Returns True if a row was updated."""
        conn = self._conn()
        cur = conn.execute(
            "UPDATE flight_events SET landed_at = ? WHERE id = ? AND landed_at IS NULL",
            (landed_at, event_id),
        )
        conn.commit()
        return cur.rowcount > 0

    def update_ticket_class(self, event_id: int, ticket_class: str) -> bool:
        """Refine the inferred ticket class after landing. Returns True on update.

        On departure we don't know the class — Torn's public ``status`` only
        tells us "Traveling to X". We open the row with a speculative
        ``"standard"`` and overwrite it the moment we observe the landing time
        (which uniquely identifies the class for that destination)."""
        conn = self._conn()
        cur = conn.execute(
            "UPDATE flight_events SET ticket_class = ? WHERE id = ?",
            (ticket_class, event_id),
        )
        conn.commit()
        return cur.rowcount > 0

    def active_flights(self) -> list[dict]:
        """All flights still in the air (landed_at IS NULL)."""
        rows = self.execute(
            "SELECT id, player_id, departed_at, destination, ticket_class, "
            "landed_at, observed_at, source "
            "FROM flight_events WHERE landed_at IS NULL "
            "ORDER BY departed_at DESC"
        )
        return [dict(r) for r in rows]

    def flights_for(self, player_id: int, limit: int = 50) -> list[dict]:
        """Recent flights for a player, newest first."""
        rows = self.execute(
            "SELECT id, player_id, departed_at, destination, ticket_class, "
            "landed_at, observed_at, source "
            "FROM flight_events WHERE player_id = ? "
            "ORDER BY observed_at DESC LIMIT ?",
            (player_id, limit),
        )
        return [dict(r) for r in rows]

    def most_recent_open(self, player_id: int) -> dict | None:
        """Return the in-air row for a player, if any.

        We expect at most one open row per player — the scheduler closes the
        previous flight before opening a new one — but we ORDER + LIMIT 1
        defensively in case a duplicate slips through (e.g. two leader
        promotions racing on the same tick)."""
        row = self.execute_one(
            "SELECT id, player_id, departed_at, destination, ticket_class, "
            "landed_at, observed_at, source "
            "FROM flight_events WHERE player_id = ? AND landed_at IS NULL "
            "ORDER BY departed_at DESC LIMIT 1",
            (player_id,),
        )
        return dict(row) if row else None

    def history_for(self, player_id: int, since: int, limit: int = 200) -> list[dict]:
        """Flights observed at or after ``since`` (unix ts), newest first."""
        rows = self.execute(
            "SELECT id, player_id, departed_at, destination, ticket_class, "
            "landed_at, observed_at, source "
            "FROM flight_events WHERE player_id = ? AND observed_at >= ? "
            "ORDER BY observed_at DESC LIMIT ?",
            (player_id, since, limit),
        )
        return [dict(r) for r in rows]

    def expire_stale_open(self, cutoff: int) -> int:
        """Close any open flight whose ``departed_at`` is older than ``cutoff``.

        Paranoia sweep — the scheduler closes flights on the
        Traveling→Okay transition, but a multi-hour outage could leave rows
        stuck `landed_at IS NULL` forever, which makes ``active_flights()``
        and ``most_recent_open()`` lie. We treat such rows as "lost the
        landing signal" and stamp them with the cutoff time.

        Returns the number of rows expired so callers can log it.
        """
        conn = self._conn()
        cur = conn.execute(
            "UPDATE flight_events SET landed_at = ? "
            "WHERE landed_at IS NULL AND departed_at < ?",
            (cutoff, cutoff),
        )
        conn.commit()
        return cur.rowcount
