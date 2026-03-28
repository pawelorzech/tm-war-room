from __future__ import annotations

import sqlite3
from cryptography.fernet import Fernet

from api.db.repos.base import BaseRepository


class KeyRepository(BaseRepository):
    def __init__(self, db_path: str, encryption_key: str) -> None:
        super().__init__(db_path)
        self._fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)

    def save_key(self, player_id: int, player_name: str, api_key: str, is_faction_key: bool = False) -> None:
        encrypted = self._fernet.encrypt(api_key.encode())
        conn = sqlite3.connect(self._db_path)
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
