"""F-18 regression: encrypted backup pipeline round-trip."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

from api.scheduler.jobs.backup_keys_db import (
    _backup_filename,
    make_backup_blob,
    restore_from_blob,
)


def _seed_db(path: str) -> None:
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE api_keys (player_id INTEGER PRIMARY KEY, api_key_encrypted BLOB)")
    conn.executemany(
        "INSERT INTO api_keys (player_id, api_key_encrypted) VALUES (?, ?)",
        [(123, b"encrypted-1"), (456, b"encrypted-2"), (789, b"encrypted-3")],
    )
    conn.commit()
    conn.close()


def test_backup_round_trip(tmp_path: Path) -> None:
    db = tmp_path / "keys.db"
    _seed_db(str(db))
    fernet_key = Fernet.generate_key().decode()

    blob = make_backup_blob(str(db), fernet_key)
    assert isinstance(blob, bytes) and len(blob) > 0
    # Fernet output starts with "gAAAAA..." — the blob is encrypted, not raw SQLite.
    assert not blob.startswith(b"SQLite format")

    raw = restore_from_blob(blob, fernet_key)
    assert raw.startswith(b"SQLite format")

    # Write restored bytes to a new file and confirm the rows survived.
    restored = tmp_path / "restored.db"
    restored.write_bytes(raw)
    conn = sqlite3.connect(str(restored))
    rows = conn.execute("SELECT player_id, api_key_encrypted FROM api_keys ORDER BY player_id").fetchall()
    conn.close()
    assert rows == [(123, b"encrypted-1"), (456, b"encrypted-2"), (789, b"encrypted-3")]


def test_backup_decrypt_fails_with_wrong_key(tmp_path: Path) -> None:
    db = tmp_path / "keys.db"
    _seed_db(str(db))
    blob = make_backup_blob(str(db), Fernet.generate_key().decode())
    other_key = Fernet.generate_key().decode()
    with pytest.raises(Exception):
        restore_from_blob(blob, other_key)


def test_backup_filename_format() -> None:
    name = _backup_filename()
    assert name.startswith("backups/keys-db/")
    assert name.endswith(".db.gz.enc")


@pytest.mark.asyncio
async def test_run_backup_skips_when_no_key(monkeypatch) -> None:
    """If BACKUP_ENCRYPTION_KEY is empty, the job returns 'skipped' instead of crashing."""
    from api.scheduler.jobs import backup_keys_db as job
    monkeypatch.setattr("api.config.BACKUP_ENCRYPTION_KEY", "")
    result = await job.run_backup_keys_db()
    assert result["status"] == "skipped"
