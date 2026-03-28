from __future__ import annotations

import sqlite3
from cryptography.fernet import Fernet


class KeyStore:
    def __init__(self, db_path: str = "data/keys.db", encryption_key: str = "") -> None:
        self._db_path = db_path
        self._fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
        self._init_db()

    def _init_db(self) -> None:
        conn = sqlite3.connect(self._db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS member_keys (
                player_id INTEGER PRIMARY KEY,
                player_name TEXT NOT NULL,
                api_key_encrypted BLOB NOT NULL,
                is_faction_key INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migration: add column if missing (existing DBs)
        try:
            conn.execute("ALTER TABLE member_keys ADD COLUMN is_faction_key INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_roles (
                player_id INTEGER PRIMARY KEY,
                granted_by INTEGER NOT NULL,
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL CHECK(type IN ('alert', 'warning', 'info', 'success')),
                message TEXT NOT NULL,
                created_by INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                revoked_at TIMESTAMP,
                revoked_by INTEGER,
                revoke_reason TEXT
            )
        """)
        conn.commit()
        conn.close()

    def save_key(self, player_id: int, player_name: str, api_key: str, is_faction_key: bool = False) -> None:
        encrypted = self._fernet.encrypt(api_key.encode())
        conn = sqlite3.connect(self._db_path)
        # If setting as faction key, clear any existing faction key first
        if is_faction_key:
            conn.execute("UPDATE member_keys SET is_faction_key = 0 WHERE is_faction_key = 1")
        conn.execute(
            """INSERT INTO member_keys (player_id, player_name, api_key_encrypted, is_faction_key)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(player_id) DO UPDATE SET
                 player_name = excluded.player_name,
                 api_key_encrypted = excluded.api_key_encrypted,
                 is_faction_key = excluded.is_faction_key""",
            (player_id, player_name, encrypted, int(is_faction_key)),
        )
        conn.commit()
        conn.close()

    def delete_key(self, player_id: int) -> None:
        conn = sqlite3.connect(self._db_path)
        conn.execute("DELETE FROM member_keys WHERE player_id = ?", (player_id,))
        conn.commit()
        conn.close()

    def get_all_keys(self) -> list[dict]:
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute("SELECT player_id, player_name, api_key_encrypted, is_faction_key FROM member_keys").fetchall()
        conn.close()
        result = []
        for player_id, player_name, encrypted, is_fk in rows:
            api_key = self._fernet.decrypt(encrypted).decode()
            result.append({"player_id": player_id, "player_name": player_name, "api_key": api_key, "is_faction_key": bool(is_fk)})
        return result

    def get_faction_key(self) -> dict | None:
        conn = sqlite3.connect(self._db_path)
        row = conn.execute("SELECT player_id, player_name, api_key_encrypted FROM member_keys WHERE is_faction_key = 1").fetchone()
        conn.close()
        if not row:
            return None
        return {"player_id": row[0], "player_name": row[1], "api_key": self._fernet.decrypt(row[2]).decode()}

    def get_keys_metadata(self) -> list[dict]:
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute(
            "SELECT player_id, player_name, is_faction_key, created_at FROM member_keys"
        ).fetchall()
        conn.close()
        return [
            {"player_id": r[0], "player_name": r[1], "is_faction_key": bool(r[2]), "created_at": r[3]}
            for r in rows
        ]

    def get_admins(self) -> list[dict]:
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute(
            "SELECT a.player_id, a.granted_by, a.granted_at, k.player_name "
            "FROM admin_roles a LEFT JOIN member_keys k ON a.player_id = k.player_id"
        ).fetchall()
        conn.close()
        return [{"player_id": r[0], "granted_by": r[1], "granted_at": r[2], "player_name": r[3] or "Unknown"} for r in rows]

    def is_admin(self, player_id: int) -> bool:
        conn = sqlite3.connect(self._db_path)
        row = conn.execute("SELECT 1 FROM admin_roles WHERE player_id = ?", (player_id,)).fetchone()
        conn.close()
        return row is not None

    def promote_admin(self, player_id: int, granted_by: int) -> None:
        conn = sqlite3.connect(self._db_path)
        conn.execute(
            "INSERT OR IGNORE INTO admin_roles (player_id, granted_by) VALUES (?, ?)",
            (player_id, granted_by),
        )
        conn.commit()
        conn.close()

    def demote_admin(self, player_id: int) -> None:
        conn = sqlite3.connect(self._db_path)
        conn.execute("DELETE FROM admin_roles WHERE player_id = ?", (player_id,))
        conn.commit()
        conn.close()

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
