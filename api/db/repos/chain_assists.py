"""Chain-assist repository (Roadmap Task #10).

Stores ``chain_assists`` rows + their hitter lists. Hitters are a JSON
blob (small, bounded by faction size — denormalising avoids a join on
every card-refresh poll).
"""

from __future__ import annotations

import json
import time

from api.db.repos.base import BaseRepository


class ChainAssistRepository(BaseRepository):
    # ── Creation / closure ────────────────────────────────────

    def create(
        self,
        *,
        channel_id: int,
        target_id: int,
        target_name: str,
        target_status_state: str,
        started_by: int,
        started_by_name: str,
    ) -> int:
        return self.mutate(
            """INSERT INTO chain_assists
               (channel_id, target_id, target_name, target_status_state,
                started_by, started_by_name, started_at, hitters)
               VALUES (?, ?, ?, ?, ?, ?, ?, '[]')""",
            (channel_id, target_id, target_name, target_status_state,
             started_by, started_by_name, int(time.time())),
        )

    def attach_message(self, assist_id: int, message_id: int) -> None:
        self.mutate(
            "UPDATE chain_assists SET message_id = ? WHERE id = ?",
            (message_id, assist_id),
        )

    def end(self, assist_id: int) -> None:
        self.mutate(
            "UPDATE chain_assists SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
            (int(time.time()), assist_id),
        )

    # ── Lookups ───────────────────────────────────────────────

    def get(self, assist_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM chain_assists WHERE id = ?", (assist_id,)
        )
        return self._hydrate(row)

    def get_active_for_channel(self, channel_id: int) -> dict | None:
        """Active = not ended. Only one active assist per channel at a time
        — newer /chain target calls auto-close older ones via the router."""
        row = self.execute_one(
            """SELECT * FROM chain_assists
               WHERE channel_id = ? AND ended_at IS NULL
               ORDER BY started_at DESC, id DESC LIMIT 1""",
            (channel_id,),
        )
        return self._hydrate(row)

    def list_active(self) -> list[dict]:
        """All currently-active assists across all channels. Used by the
        scheduler poller."""
        rows = self.execute(
            "SELECT * FROM chain_assists WHERE ended_at IS NULL"
        )
        return [self._hydrate(r) for r in rows if r is not None]  # type: ignore[misc]

    # ── Hitters ───────────────────────────────────────────────

    def add_hitter(self, assist_id: int, player_id: int, player_name: str) -> dict | None:
        """Idempotent add — same player joining twice is a no-op."""
        cur = self.get(assist_id)
        if cur is None or cur.get("ended_at"):
            return None
        hitters = list(cur.get("hitters") or [])
        if any(int(h.get("id", 0)) == player_id for h in hitters):
            return cur
        hitters.append({"id": player_id, "name": player_name})
        self.mutate(
            "UPDATE chain_assists SET hitters = ? WHERE id = ?",
            (json.dumps(hitters), assist_id),
        )
        cur["hitters"] = hitters
        return cur

    # ── Status polling support ────────────────────────────────

    def update_target_status(self, assist_id: int, new_state: str) -> str | None:
        """Persist new state, return the *previous* state so the caller can
        detect flips. Returns None if the assist is unknown / already ended.
        """
        row = self.execute_one(
            "SELECT target_status_state, ended_at FROM chain_assists WHERE id = ?",
            (assist_id,),
        )
        if not row or row["ended_at"] is not None:
            return None
        prev = row["target_status_state"]
        if prev == new_state:
            return prev
        self.mutate(
            "UPDATE chain_assists SET target_status_state = ? WHERE id = ?",
            (new_state, assist_id),
        )
        return prev

    # ── Helpers ───────────────────────────────────────────────

    def _hydrate(self, row) -> dict | None:
        if row is None:
            return None
        d = dict(row)
        try:
            d["hitters"] = json.loads(d.get("hitters") or "[]")
        except (TypeError, ValueError):
            d["hitters"] = []
        return d
