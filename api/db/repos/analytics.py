from __future__ import annotations

from datetime import datetime, timedelta, timezone

from api.db.repos.base import BaseRepository


class AnalyticsRepository(BaseRepository):
    def __init__(self, db_path: str) -> None:
        super().__init__(db_path)

    def log_request(
        self,
        player_id: int | None,
        method: str,
        endpoint: str,
        status_code: int,
        response_time_ms: float,
        error_message: str | None = None,
    ) -> None:
        self.mutate(
            "INSERT INTO request_log (player_id, method, endpoint, status_code, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?, ?)",
            (player_id, method, endpoint, status_code, response_time_ms, error_message),
        )

    def log_integration(
        self,
        service: str,
        endpoint: str,
        success: bool,
        response_time_ms: float,
        error_message: str | None = None,
    ) -> None:
        self.mutate(
            "INSERT INTO integration_log (service, endpoint, success, response_time_ms, error_message) VALUES (?, ?, ?, ?, ?)",
            (service, endpoint, int(success), response_time_ms, error_message),
        )

    def cleanup(self, days: int = 30) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        conn.execute("DELETE FROM request_log WHERE timestamp < ?", (cutoff,))
        conn.execute("DELETE FROM integration_log WHERE timestamp < ?", (cutoff,))
        conn.commit()

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
        return [
            {"endpoint": r[0], "status_code": r[1], "count": r[2], "last_occurred": r[3], "last_error_message": r[4]}
            for r in rows
        ]

    def get_integration_status(self) -> dict[str, dict]:
        conn = self._conn()
        services = conn.execute("SELECT DISTINCT service FROM integration_log").fetchall()
        result = {}
        for (service,) in services:
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
            is_error = last_entry and last_entry[0] == 0
            result[service] = {
                "status": "error" if is_error else "ok",
                "last_success": last_ok[0] if last_ok else None,
                "last_error": last_err[1] if last_err else None,
                "last_error_at": last_err[0] if last_err else None,
            }
        return result
