from __future__ import annotations
import os
import sqlite3
import threading

# Module-level thread-local connection pool keyed by absolute db path
_local = threading.local()


def _get_conn(db_path: str) -> sqlite3.Connection:
    """Return a reusable thread-local connection for *db_path*."""
    cache: dict[str, tuple[sqlite3.Connection, float]] = getattr(_local, "conns", None) or {}
    _local.conns = cache

    abs_path = os.path.realpath(db_path)
    entry = cache.get(abs_path)

    # Reuse existing connection if the file hasn't been replaced
    if entry is not None:
        conn, mtime = entry
        try:
            cur_mtime = os.path.getmtime(abs_path)
        except OSError:
            cur_mtime = 0
        if mtime == cur_mtime:
            try:
                conn.execute("SELECT 1")
                return conn
            except sqlite3.ProgrammingError:
                pass
        # Stale — close and recreate
        try:
            conn.close()
        except Exception:
            pass

    conn = sqlite3.connect(abs_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-8000")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA mmap_size=67108864")
    try:
        mtime = os.path.getmtime(abs_path)
    except OSError:
        mtime = 0
    cache[abs_path] = (conn, mtime)
    return conn


class BaseRepository:
    def __init__(self, db_path: str):
        self._db_path = db_path

    def _conn(self) -> sqlite3.Connection:
        return _get_conn(self._db_path)

    def execute(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        return self._conn().execute(sql, params).fetchall()

    def execute_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        rows = self.execute(sql, params)
        return rows[0] if rows else None

    def mutate(self, sql: str, params: tuple = ()) -> int:
        conn = self._conn()
        cursor = conn.execute(sql, params)
        conn.commit()
        # For INSERT OR IGNORE that skips, rowcount==0 → return 0
        if cursor.rowcount == 0:
            return 0
        return cursor.lastrowid
