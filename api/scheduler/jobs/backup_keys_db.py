"""F-18: daily encrypted backup of data/keys.db to B2.

Workflow:
1. Snapshot keys.db via SQLite Online Backup API (consistent even with WAL writers).
2. gzip the snapshot bytes.
3. Encrypt with Fernet using BACKUP_ENCRYPTION_KEY (separate from ENCRYPTION_KEY).
4. Upload to B2 under backups/keys-db/YYYY-MM-DD-HHMMSS.db.gz.enc.
5. Delete backups older than BACKUP_RETENTION_DAYS.

Restore: see docs/RUNBOOK_RESTORE_KEYS_DB.md.
"""

from __future__ import annotations

import gzip
import io
import logging
import sqlite3
import time
from datetime import datetime, timezone

from api.scheduler.jobs._log_helpers import with_sentry_capture

logger = logging.getLogger("tm-hub.scheduler.backup")

BACKUP_PREFIX = "backups/keys-db/"


def _snapshot_sqlite(db_path: str) -> bytes:
    """Use the SQLite Online Backup API to copy a live DB into memory.
    Safe to run while writers are active (WAL mode)."""
    src = sqlite3.connect(db_path)
    try:
        # Backup to an in-memory DB, then dump bytes via serialize().
        dst = sqlite3.connect(":memory:")
        try:
            src.backup(dst)
            return dst.serialize()
        finally:
            dst.close()
    finally:
        src.close()


def _encrypt(payload: bytes, fernet_key: str) -> bytes:
    from cryptography.fernet import Fernet
    return Fernet(fernet_key.encode()).encrypt(payload)


def _decrypt(payload: bytes, fernet_key: str) -> bytes:
    from cryptography.fernet import Fernet
    return Fernet(fernet_key.encode()).decrypt(payload)


def make_backup_blob(db_path: str, fernet_key: str) -> bytes:
    """Pure helper: snapshot → gzip → encrypt. Used by job + tests."""
    raw = _snapshot_sqlite(db_path)
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6, mtime=0) as gz:
        gz.write(raw)
    return _encrypt(buf.getvalue(), fernet_key)


def restore_from_blob(blob: bytes, fernet_key: str) -> bytes:
    """Inverse: decrypt → gunzip → raw SQLite bytes. Returned bytes can be written to disk."""
    decrypted = _decrypt(blob, fernet_key)
    return gzip.decompress(decrypted)


def _backup_filename(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return f"{BACKUP_PREFIX}{now.strftime('%Y-%m-%d-%H%M%S')}.db.gz.enc"


@with_sentry_capture("backup_keys_db")
async def run_backup_keys_db() -> dict:
    """Scheduler entry point. Returns a dict with status / details for logging."""
    from api import b2_client
    from api.config import BACKUP_ENCRYPTION_KEY, BACKUP_RETENTION_DAYS, APP_VERSION

    if not BACKUP_ENCRYPTION_KEY:
        if APP_VERSION != "dev":
            logger.warning("F-18 backup skipped: BACKUP_ENCRYPTION_KEY not set in prod — set it!")
        return {"status": "skipped", "reason": "no BACKUP_ENCRYPTION_KEY"}

    if not b2_client.is_configured():
        logger.info("F-18 backup skipped: B2 not configured")
        return {"status": "skipped", "reason": "B2 not configured"}

    db_path = "data/keys.db"
    started = time.time()
    try:
        blob = make_backup_blob(db_path, BACKUP_ENCRYPTION_KEY)
    except Exception as exc:
        logger.exception("F-18 backup failed during snapshot/encrypt: %s", exc)
        return {"status": "error", "reason": "snapshot/encrypt", "detail": str(exc)}

    remote_path = _backup_filename()
    try:
        b2_client.upload_private_bytes(remote_path, blob, content_type="application/octet-stream")
    except Exception as exc:
        logger.exception("F-18 backup upload failed: %s", exc)
        return {"status": "error", "reason": "b2_upload", "detail": str(exc)}

    elapsed = time.time() - started
    logger.info("F-18 backup uploaded: %s (%d bytes, %.1fs)", remote_path, len(blob), elapsed)

    # Retention sweep
    deleted = 0
    try:
        cutoff_ms = int((time.time() - BACKUP_RETENTION_DAYS * 86400) * 1000)
        for f in b2_client.list_files(BACKUP_PREFIX):
            if f["upload_timestamp_ms"] < cutoff_ms:
                try:
                    b2_client.delete_file(f["file_name"], f["file_id"])
                    deleted += 1
                except Exception as del_exc:
                    logger.warning("F-18 retention: failed to delete %s: %s", f["file_name"], del_exc)
    except Exception as exc:
        logger.warning("F-18 retention sweep failed: %s", exc)

    return {
        "status": "ok",
        "uploaded": remote_path,
        "size_bytes": len(blob),
        "elapsed_seconds": round(elapsed, 2),
        "retention_deleted": deleted,
    }
