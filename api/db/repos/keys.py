from __future__ import annotations

from cryptography.fernet import Fernet

from api.db.repos.base import BaseRepository


class KeyRepository(BaseRepository):
    def __init__(self, db_path: str, encryption_key: str) -> None:
        super().__init__(db_path)
        self._fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)

    def save_key(self, player_id: int, player_name: str, api_key: str, is_faction_key: bool = False) -> None:
        encrypted = self._fernet.encrypt(api_key.encode())
        conn = self._conn()
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

    def delete_key(self, player_id: int) -> None:
        self.mutate("DELETE FROM member_keys WHERE player_id = ?", (player_id,))

    def has_key(self, player_id: int) -> bool:
        return self.execute_one("SELECT 1 FROM member_keys WHERE player_id = ?", (player_id,)) is not None

    def get_key(self, player_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT player_id, player_name, api_key_encrypted, is_faction_key FROM member_keys WHERE player_id = ?",
            (player_id,),
        )
        if not row:
            return None
        return {
            "player_id": row[0],
            "player_name": row[1],
            "api_key": self._fernet.decrypt(row[2]).decode(),
            "is_faction_key": bool(row[3]),
        }

    def get_all_keys(self) -> list[dict]:
        rows = self.execute("SELECT player_id, player_name, api_key_encrypted, is_faction_key FROM member_keys")
        result = []
        for player_id, player_name, encrypted, is_fk in rows:
            api_key = self._fernet.decrypt(encrypted).decode()
            result.append({"player_id": player_id, "player_name": player_name, "api_key": api_key, "is_faction_key": bool(is_fk)})
        return result

    def get_all_player_ids_with_keys(self) -> list[tuple[int, str]]:
        """Return (player_id, encrypted_key) pairs without decryption."""
        rows = self.execute("SELECT player_id, api_key_encrypted FROM member_keys")
        return [(r[0], r[1]) for r in rows]

    def decrypt_key(self, encrypted: bytes | str) -> str:
        """Decrypt a single API key on demand."""
        return self._fernet.decrypt(encrypted).decode()

    def get_faction_key(self) -> dict | None:
        row = self.execute_one("SELECT player_id, player_name, api_key_encrypted FROM member_keys WHERE is_faction_key = 1")
        if not row:
            return None
        return {"player_id": row[0], "player_name": row[1], "api_key": self._fernet.decrypt(row[2]).decode()}

    def get_keys_metadata(self) -> list[dict]:
        rows = self.execute("SELECT player_id, player_name, is_faction_key, created_at FROM member_keys")
        return [
            {"player_id": r[0], "player_name": r[1], "is_faction_key": bool(r[2]), "created_at": r[3]}
            for r in rows
        ]

    def set_avatar(self, player_id: int, url: str, fetched_at: int) -> None:
        self.mutate(
            "UPDATE member_keys SET avatar_url = ?, avatar_fetched_at = ? WHERE player_id = ?",
            (url, fetched_at, player_id),
        )

    def get_avatar_map(self) -> dict[int, str]:
        rows = self.execute("SELECT player_id, avatar_url FROM member_keys WHERE avatar_url IS NOT NULL")
        return {r[0]: r[1] for r in rows}

    def get_admins(self) -> list[dict]:
        rows = self.execute(
            "SELECT a.player_id, a.granted_by, a.granted_at, k.player_name "
            "FROM admin_roles a LEFT JOIN member_keys k ON a.player_id = k.player_id"
        )
        return [{"player_id": r[0], "granted_by": r[1], "granted_at": r[2], "player_name": r[3] or "Unknown"} for r in rows]

    def is_admin(self, player_id: int) -> bool:
        return self.execute_one("SELECT 1 FROM admin_roles WHERE player_id = ?", (player_id,)) is not None

    def promote_admin(self, player_id: int, granted_by: int) -> None:
        self.mutate(
            "INSERT OR IGNORE INTO admin_roles (player_id, granted_by) VALUES (?, ?)",
            (player_id, granted_by),
        )

    def demote_admin(self, player_id: int) -> None:
        self.mutate("DELETE FROM admin_roles WHERE player_id = ?", (player_id,))

    # --- TornStats per-user keys (see migration 053) ---

    def set_tornstats_key(self, player_id: int, ts_key: str) -> None:
        """Store an encrypted TornStats key for a member and mark it 'ok'.

        Caller must have validated the key against TornStats first; this
        method only persists. The 'ok' status here means "we believed it was
        good at write time"; subsequent fetch failures flip it to 'invalid'
        via mark_tornstats_key_status.
        """
        encrypted = self._fernet.encrypt(ts_key.encode())
        self.mutate(
            "UPDATE member_keys SET tornstats_key_encrypted = ?, tornstats_key_status = 'ok', "
            "tornstats_key_validated_at = CURRENT_TIMESTAMP WHERE player_id = ?",
            (encrypted, player_id),
        )

    def clear_tornstats_key(self, player_id: int) -> None:
        self.mutate(
            "UPDATE member_keys SET tornstats_key_encrypted = NULL, tornstats_key_status = NULL, "
            "tornstats_key_validated_at = NULL WHERE player_id = ?",
            (player_id,),
        )

    def get_tornstats_key(self, player_id: int) -> str | None:
        """Decrypted TornStats key for a player, or None if missing/invalid.

        Known-bad keys (status='invalid') are not returned — callers must
        clear+re-set them, not silently retry into another 403.
        """
        row = self.execute_one(
            "SELECT tornstats_key_encrypted, tornstats_key_status FROM member_keys WHERE player_id = ?",
            (player_id,),
        )
        if not row or not row[0]:
            return None
        if row[1] == "invalid":
            return None
        return self._fernet.decrypt(row[0]).decode()

    def get_tornstats_key_meta(self, player_id: int) -> dict:
        """Status info for the Settings UI — no plaintext key leaves the DB."""
        row = self.execute_one(
            "SELECT tornstats_key_status, tornstats_key_validated_at, "
            "CASE WHEN tornstats_key_encrypted IS NULL THEN 0 ELSE 1 END "
            "FROM member_keys WHERE player_id = ?",
            (player_id,),
        )
        if not row:
            return {"has_key": False, "status": None, "validated_at": None}
        return {"has_key": bool(row[2]), "status": row[0], "validated_at": row[1]}

    def get_all_valid_tornstats_keys(self) -> list[tuple[int, str]]:
        """(player_id, decrypted_key) for every member with a non-invalid TornStats key.

        Used by /api/spy/{id} as the round-robin pool: after the caller's own
        key fails, we try other members' keys before falling back to the
        global env key. Each key sees different faction-spy entries on
        TornStats, so the union covers more XIDs than any one key alone.
        """
        rows = self.execute(
            "SELECT player_id, tornstats_key_encrypted FROM member_keys "
            "WHERE tornstats_key_encrypted IS NOT NULL "
            "AND (tornstats_key_status IS NULL OR tornstats_key_status != 'invalid')"
        )
        return [(r[0], self._fernet.decrypt(r[1]).decode()) for r in rows]

    def mark_tornstats_key_status(self, player_id: int, status: str) -> None:
        """Flip status='ok' or 'invalid' after a live TornStats call. Idempotent."""
        self.mutate(
            "UPDATE member_keys SET tornstats_key_status = ?, "
            "tornstats_key_validated_at = CURRENT_TIMESTAMP WHERE player_id = ?",
            (status, player_id),
        )
