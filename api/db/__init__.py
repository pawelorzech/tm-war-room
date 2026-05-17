from __future__ import annotations

import os

from api.db.migrations.runner import run_migrations
from api.db.repos.announcements import AnnouncementRepository
from api.db.repos.keys import KeyRepository


class KeyStore:
    """Backwards-compatible wrapper. Delegates to KeyRepository + AnnouncementRepository."""

    def __init__(self, db_path: str = "data/keys.db", encryption_key: str = "") -> None:
        migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
        if os.path.isdir(migrations_dir):
            run_migrations(db_path, migrations_dir)
        self._keys = KeyRepository(db_path, encryption_key)
        self._announcements = AnnouncementRepository(db_path)

    def save_key(self, *a, **kw): return self._keys.save_key(*a, **kw)
    def delete_key(self, *a, **kw): return self._keys.delete_key(*a, **kw)
    def get_all_keys(self): return self._keys.get_all_keys()
    def has_key(self, player_id): return self._keys.has_key(player_id)
    def get_key(self, player_id): return self._keys.get_key(player_id)
    def get_faction_key(self): return self._keys.get_faction_key()
    def get_keys_metadata(self): return self._keys.get_keys_metadata()
    def get_admins(self): return self._keys.get_admins()
    def is_admin(self, player_id): return self._keys.is_admin(player_id)
    def promote_admin(self, player_id, granted_by): return self._keys.promote_admin(player_id, granted_by)
    def demote_admin(self, player_id): return self._keys.demote_admin(player_id)
    def set_tornstats_key(self, player_id, ts_key): return self._keys.set_tornstats_key(player_id, ts_key)
    def clear_tornstats_key(self, player_id): return self._keys.clear_tornstats_key(player_id)
    def get_tornstats_key(self, player_id): return self._keys.get_tornstats_key(player_id)
    def get_tornstats_key_meta(self, player_id): return self._keys.get_tornstats_key_meta(player_id)
    def get_all_valid_tornstats_keys(self): return self._keys.get_all_valid_tornstats_keys()
    def mark_tornstats_key_status(self, player_id, status): return self._keys.mark_tornstats_key_status(player_id, status)
    def create_announcement(self, *a, **kw): return self._announcements.create_announcement(*a, **kw)
    def get_active_announcements(self): return self._announcements.get_active_announcements()
    def get_all_announcements(self): return self._announcements.get_all_announcements()
    def revoke_announcement(self, ann_id, revoked_by, reason=None): return self._announcements.revoke_announcement(ann_id, revoked_by, reason)

    @property
    def _db_path(self):
        return self._keys._db_path
