from __future__ import annotations

import time

from api.db.repos.base import BaseRepository


class RevokedJwtRepository(BaseRepository):
    """F-16: server-side JWT revocation list.

    Stateless JWT cannot be killed before its `exp`; we store the `jti`
    claim of explicitly logged-out tokens. Periodic cleanup drops entries
    past their original `exp` so the table stays small.
    """

    def revoke(self, jti: str, expires_at: int, player_id: int | None = None) -> None:
        if not jti:
            return
        self.mutate(
            "INSERT OR IGNORE INTO revoked_jwts (jti, expires_at, revoked_at, player_id) VALUES (?, ?, ?, ?)",
            (jti, int(expires_at), int(time.time()), player_id),
        )

    def is_revoked(self, jti: str) -> bool:
        if not jti:
            return False
        row = self.execute_one("SELECT 1 FROM revoked_jwts WHERE jti = ? LIMIT 1", (jti,))
        return row is not None

    def cleanup_expired(self) -> int:
        """Drop rows whose original token already expired. Safe to call periodically."""
        now = int(time.time())
        cur = self.execute("DELETE FROM revoked_jwts WHERE expires_at < ?", (now,))
        return getattr(cur, "rowcount", 0) or 0
