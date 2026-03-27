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
