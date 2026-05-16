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
