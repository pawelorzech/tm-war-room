from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone


class AnalyticsStore:
    def __init__(self, db_path: str = "data/analytics.db") -> None:
        self._db_path = db_path
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def _init_db(self) -> None:
        conn = self._conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS request_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                player_id INTEGER,
                method TEXT,
                endpoint TEXT,
                status_code INTEGER,
                response_time_ms REAL,
                error_message TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rl_timestamp ON request_log(timestamp)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rl_player_id ON request_log(player_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rl_endpoint ON request_log(endpoint)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS integration_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                service TEXT NOT NULL,
                endpoint TEXT,
                success INTEGER NOT NULL,
                response_time_ms REAL,
                error_message TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_il_service ON integration_log(service)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_il_timestamp ON integration_log(timestamp)")
        conn.commit()
        conn.close()

    def log_request(
        self,
        player_id: int | None,
        method: str,
        endpoint: str,
        status_code: int,
        response_time_ms: float,
        error_message: str | None = None,
    ) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT INTO request_log (player_id, method, endpoint, status_code, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?, ?)",
            (player_id, method, endpoint, status_code, response_time_ms, error_message),
        )
        conn.commit()
        conn.close()

    def log_integration(
        self,
        service: str,
        endpoint: str,
        success: bool,
        response_time_ms: float,
        error_message: str | None = None,
    ) -> None:
        conn = self._conn()
        conn.execute(
            "INSERT INTO integration_log (service, endpoint, success, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?)",
            (service, endpoint, int(success), response_time_ms, error_message),
        )
        conn.commit()
        conn.close()

    def cleanup(self, days: int = 30) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        conn.execute("DELETE FROM request_log WHERE timestamp < ?", (cutoff,))
        conn.execute("DELETE FROM integration_log WHERE timestamp < ?", (cutoff,))
        conn.commit()
        conn.close()
