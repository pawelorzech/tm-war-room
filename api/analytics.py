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
        conn.execute("PRAGMA journal_mode=WAL")
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

    def get_request_stats(self, days: int = 7) -> dict:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        per_day = conn.execute(
            "SELECT date(timestamp) as day, COUNT(*) as cnt, AVG(response_time_ms) as avg_ms "
            "FROM request_log WHERE timestamp >= ? GROUP BY day ORDER BY day",
            (cutoff,),
        ).fetchall()
        per_endpoint = conn.execute(
            "SELECT endpoint, COUNT(*) as cnt, AVG(response_time_ms) as avg_ms "
            "FROM request_log WHERE timestamp >= ? GROUP BY endpoint ORDER BY cnt DESC",
            (cutoff,),
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM request_log WHERE timestamp >= ?", (cutoff,)
        ).fetchone()[0]
        conn.close()
        return {
            "per_day": [{"date": r[0], "count": r[1], "avg_response_ms": round(r[2], 1)} for r in per_day],
            "per_endpoint": [{"endpoint": r[0], "count": r[1], "avg_response_ms": round(r[2], 1)} for r in per_endpoint],
            "total_requests": total,
        }

    def get_user_stats(self, days: int = 7) -> list[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        rows = conn.execute(
            "SELECT player_id, MAX(timestamp) as last_seen, COUNT(*) as cnt "
            "FROM request_log WHERE timestamp >= ? AND player_id IS NOT NULL "
            "GROUP BY player_id ORDER BY last_seen DESC",
            (cutoff,),
        ).fetchall()
        conn.close()
        return [{"player_id": r[0], "last_seen": r[1], "request_count": r[2]} for r in rows]

    def get_error_stats(self, days: int = 7) -> list[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        rows = conn.execute(
            "SELECT endpoint, status_code, COUNT(*) as cnt, MAX(timestamp) as last_occurred, error_message "
            "FROM request_log WHERE timestamp >= ? AND status_code >= 400 "
            "GROUP BY endpoint, status_code ORDER BY cnt DESC",
            (cutoff,),
        ).fetchall()
        conn.close()
        return [
            {"endpoint": r[0], "status_code": r[1], "count": r[2], "last_occurred": r[3], "last_error_message": r[4]}
            for r in rows
        ]

    def get_integration_status(self) -> dict[str, dict]:
        conn = self._conn()
        services = conn.execute("SELECT DISTINCT service FROM integration_log").fetchall()
        result = {}
        for (service,) in services:
            # Get the most recent entry (success or failure) by id to maintain insertion order
            last_entry = conn.execute(
                "SELECT success, timestamp, error_message FROM integration_log WHERE service = ? ORDER BY id DESC LIMIT 1",
                (service,),
            ).fetchone()
            last_ok = conn.execute(
                "SELECT timestamp FROM integration_log WHERE service = ? AND success = 1 ORDER BY id DESC LIMIT 1",
                (service,),
            ).fetchone()
            last_err = conn.execute(
                "SELECT timestamp, error_message FROM integration_log WHERE service = ? AND success = 0 ORDER BY id DESC LIMIT 1",
                (service,),
            ).fetchone()
            # Status is "error" if the most recent entry is a failure
            is_error = last_entry and last_entry[0] == 0
            result[service] = {
                "status": "error" if is_error else "ok",
                "last_success": last_ok[0] if last_ok else None,
                "last_error": last_err[1] if last_err else None,
                "last_error_at": last_err[0] if last_err else None,
            }
        conn.close()
        return result
