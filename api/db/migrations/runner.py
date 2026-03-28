from __future__ import annotations
import logging
import os
import sqlite3

logger = logging.getLogger("tm-hub.migrations")

def run_migrations(db_path: str, migrations_dir: str) -> list[str]:
    """Apply unapplied SQL migration files in filename order. Returns list of newly applied filenames."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    applied = {row[0] for row in conn.execute("SELECT filename FROM _migrations").fetchall()}
    migration_files = sorted(
        f for f in os.listdir(migrations_dir)
        if f.endswith(".sql") and f not in applied
    )
    newly_applied = []
    for filename in migration_files:
        filepath = os.path.join(migrations_dir, filename)
        sql = open(filepath).read()
        try:
            conn.executescript(sql)
            conn.execute("INSERT INTO _migrations (filename) VALUES (?)", (filename,))
            conn.commit()
            logger.info("Applied migration: %s", filename)
            newly_applied.append(filename)
        except Exception as e:
            logger.error("Migration %s failed: %s", filename, e)
            raise
    conn.close()
    return newly_applied
