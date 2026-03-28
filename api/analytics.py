from __future__ import annotations

import os

from api.db.migrations.runner import run_migrations
from api.db.repos.analytics import AnalyticsRepository


class AnalyticsStore:
    """Backwards-compatible wrapper delegating to AnalyticsRepository."""

    def __init__(self, db_path: str = "data/analytics.db") -> None:
        migrations_dir = os.path.join(os.path.dirname(__file__), "db", "migrations")
        if os.path.isdir(migrations_dir):
            run_migrations(db_path, migrations_dir)
        self._repo = AnalyticsRepository(db_path)

    @property
    def _db_path(self):
        return self._repo._db_path

    def log_request(self, *a, **kw): return self._repo.log_request(*a, **kw)
    def log_integration(self, *a, **kw): return self._repo.log_integration(*a, **kw)
    def cleanup(self, *a, **kw): return self._repo.cleanup(*a, **kw)
    def get_request_stats(self, *a, **kw): return self._repo.get_request_stats(*a, **kw)
    def get_user_stats(self, *a, **kw): return self._repo.get_user_stats(*a, **kw)
    def get_error_stats(self, *a, **kw): return self._repo.get_error_stats(*a, **kw)
    def get_integration_status(self): return self._repo.get_integration_status()
