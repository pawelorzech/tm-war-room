from __future__ import annotations

import sqlite3

from api.db.repos.base import BaseRepository


class AnnouncementRepository(BaseRepository):
    def __init__(self, db_path: str) -> None:
        super().__init__(db_path)

    def create_announcement(self, type: str, message: str, created_by: int, expires_at: str | None = None) -> int:
        conn = sqlite3.connect(self._db_path)
        cur = conn.execute(
            "INSERT INTO announcements (type, message, created_by, expires_at) VALUES (?, ?, ?, ?)",
            (type, message, created_by, expires_at),
        )
        ann_id = cur.lastrowid
        conn.commit()
        conn.close()
        return ann_id

    def get_active_announcements(self) -> list[dict]:
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute(
            "SELECT id, type, message, created_by, created_at, expires_at "
            "FROM announcements "
            "WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now')) "
            "ORDER BY CASE type WHEN 'alert' THEN 0 ELSE 1 END, created_at DESC"
        ).fetchall()
        conn.close()
        return [{"id": r[0], "type": r[1], "message": r[2], "created_by": r[3], "created_at": r[4], "expires_at": r[5]} for r in rows]

    def get_all_announcements(self) -> list[dict]:
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute(
            "SELECT id, type, message, created_by, created_at, expires_at, revoked_at, revoked_by, revoke_reason "
            "FROM announcements ORDER BY created_at DESC"
        ).fetchall()
        conn.close()
        return [
            {"id": r[0], "type": r[1], "message": r[2], "created_by": r[3], "created_at": r[4],
             "expires_at": r[5], "revoked_at": r[6], "revoked_by": r[7], "revoke_reason": r[8]}
            for r in rows
        ]

    def revoke_announcement(self, ann_id: int, revoked_by: int, reason: str | None = None) -> bool:
        conn = sqlite3.connect(self._db_path)
        cur = conn.execute(
            "UPDATE announcements SET revoked_at = datetime('now'), revoked_by = ?, revoke_reason = ? "
            "WHERE id = ? AND revoked_at IS NULL",
            (revoked_by, reason, ann_id),
        )
        conn.commit()
        changed = cur.rowcount > 0
        conn.close()
        return changed
