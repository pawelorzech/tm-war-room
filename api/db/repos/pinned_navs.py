from __future__ import annotations

from api.db.repos.base import BaseRepository


class PinnedNavsRepository(BaseRepository):
    """Per-player pinned nav hrefs (favorites synced cross-device)."""

    def list_for(self, player_id: int) -> list[str]:
        rows = self.execute(
            "SELECT href FROM user_pinned_navs WHERE player_id = ? ORDER BY position ASC, created_at ASC",
            (player_id,),
        )
        return [r[0] for r in rows]

    def set_for(self, player_id: int, hrefs: list[str]) -> None:
        """Idempotent replace: stores exactly `hrefs` for this player, preserving order."""
        conn = self._conn()
        conn.execute("BEGIN")
        try:
            conn.execute("DELETE FROM user_pinned_navs WHERE player_id = ?", (player_id,))
            conn.executemany(
                "INSERT INTO user_pinned_navs (player_id, href, position) VALUES (?, ?, ?)",
                [(player_id, href, pos) for pos, href in enumerate(hrefs)],
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
