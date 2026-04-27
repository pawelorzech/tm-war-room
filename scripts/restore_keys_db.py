#!/usr/bin/env python3
"""F-18 restore tool — fetch + decrypt + write a keys.db backup.

Usage (in production container):
    BACKUP_ENCRYPTION_KEY=... B2_APPLICATION_KEY_ID=... B2_APPLICATION_KEY=... B2_BUCKET_NAME=... B2_PUBLIC_URL=... \
        python scripts/restore_keys_db.py --remote backups/keys-db/2026-04-27-031500.db.gz.enc --out /tmp/keys.db

If --remote is omitted, the latest backup is restored.
After producing /tmp/keys.db, sanity-check with:
    sqlite3 /tmp/keys.db "SELECT COUNT(*) FROM api_keys;"
Then atomically swap into the live volume during a maintenance window.
"""

from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore keys.db backup from B2")
    parser.add_argument("--remote", help="B2 file_name (default: latest)")
    parser.add_argument("--out", required=True, help="Local path to write decrypted SQLite DB")
    parser.add_argument("--list", action="store_true", help="List available backups and exit")
    args = parser.parse_args()

    backup_key = os.environ.get("BACKUP_ENCRYPTION_KEY", "")
    if not backup_key:
        print("ERROR: BACKUP_ENCRYPTION_KEY env var required", file=sys.stderr)
        return 2

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from api import b2_client  # noqa: E402
    from api.scheduler.jobs.backup_keys_db import BACKUP_PREFIX, restore_from_blob  # noqa: E402

    if not b2_client.is_configured():
        print("ERROR: B2 not configured (need B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_PUBLIC_URL)", file=sys.stderr)
        return 2

    files = sorted(b2_client.list_files(BACKUP_PREFIX), key=lambda f: f["upload_timestamp_ms"])
    if not files:
        print(f"No backups found under {BACKUP_PREFIX}", file=sys.stderr)
        return 1

    if args.list:
        for f in files:
            ts = f["upload_timestamp_ms"] / 1000
            from datetime import datetime, timezone
            iso = datetime.fromtimestamp(ts, timezone.utc).isoformat()
            print(f"{iso}  {f['size']:>10}B  {f['file_name']}")
        return 0

    target = args.remote or files[-1]["file_name"]
    print(f"Downloading {target} ...")
    tmp_blob = args.out + ".enc"
    b2_client.download_to_path(target, tmp_blob)
    with open(tmp_blob, "rb") as fh:
        blob = fh.read()
    try:
        raw = restore_from_blob(blob, backup_key)
    finally:
        try:
            os.remove(tmp_blob)
        except OSError:
            pass

    with open(args.out, "wb") as fh:
        fh.write(raw)
    print(f"Wrote {len(raw):,} bytes to {args.out}")
    print("Next: sqlite3", args.out, '"SELECT COUNT(*) FROM api_keys;"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
