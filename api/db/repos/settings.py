from __future__ import annotations
import time
from api.db.repos.base import BaseRepository

_PUBLIC_KEYS = {"chat_enabled_for_all"}


class AppSettingsRepository(BaseRepository):

    def get(self, key: str) -> str | None:
        row = self.execute_one(
            "SELECT value FROM app_settings WHERE key = ?", (key,)
        )
        return row["value"] if row else None

    def set(self, key: str, value: str, updated_by: int | None = None) -> None:
        self.mutate(
            """INSERT INTO app_settings (key, value, updated_at, updated_by)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(key) DO UPDATE
               SET value = excluded.value,
                   updated_at = excluded.updated_at,
                   updated_by = excluded.updated_by""",
            (key, value, time.time(), updated_by),
        )

    def get_all(self) -> dict[str, str]:
        rows = self.execute("SELECT key, value FROM app_settings")
        return {r["key"]: r["value"] for r in rows}

    def get_public(self) -> dict[str, str]:
        all_settings = self.get_all()
        return {k: v for k, v in all_settings.items() if k in _PUBLIC_KEYS}
