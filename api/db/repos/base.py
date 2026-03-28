from __future__ import annotations
import sqlite3

class BaseRepository:
    def __init__(self, db_path: str):
        self._db_path = db_path

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def execute(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._conn() as conn:
            return conn.execute(sql, params).fetchall()

    def execute_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        rows = self.execute(sql, params)
        return rows[0] if rows else None

    def mutate(self, sql: str, params: tuple = ()) -> int:
        with self._conn() as conn:
            cursor = conn.execute(sql, params)
            conn.commit()
            return cursor.lastrowid
