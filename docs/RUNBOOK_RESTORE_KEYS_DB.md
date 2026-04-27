# Runbook — Restore `data/keys.db` from B2 Backup (F-18)

## When to use

- `data/keys.db` is corrupted, deleted, or the volume was lost.
- Need to spin up a staging environment with realistic data.
- Quarterly **restore drill** (verifies backups actually work — see end of doc).

## Prerequisites

You need these env vars (set in Coolify or pasted into the container shell):

```
BACKUP_ENCRYPTION_KEY      # Fernet key used at backup time
B2_APPLICATION_KEY_ID
B2_APPLICATION_KEY
B2_BUCKET_NAME=tmhubmedia
B2_PUBLIC_URL=https://...   # any non-empty value works for restore
```

## 1. List available backups

```bash
docker exec -it tm-hub python scripts/restore_keys_db.py --list --out /tmp/x.db
```

Output (most recent last):

```
2026-04-27T03:15:00+00:00     2_184_521B  backups/keys-db/2026-04-27-031500.db.gz.enc
2026-04-26T03:15:00+00:00     2_180_004B  backups/keys-db/2026-04-26-031500.db.gz.enc
...
```

## 2. Restore to a temp file (does NOT touch live volume yet)

```bash
docker exec -it tm-hub python scripts/restore_keys_db.py \
    --remote backups/keys-db/2026-04-27-031500.db.gz.enc \
    --out /tmp/keys-restored.db
```

Or omit `--remote` to restore the latest backup:

```bash
docker exec -it tm-hub python scripts/restore_keys_db.py --out /tmp/keys-restored.db
```

## 3. Sanity-check the restored DB

```bash
docker exec -it tm-hub sqlite3 /tmp/keys-restored.db <<'SQL'
SELECT COUNT(*) AS api_keys FROM api_keys;
SELECT COUNT(*) AS admins FROM admin_roles;
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
SQL
```

You should see >0 keys, the admin_roles table, and the same set of tables as production.

## 4. (Drill only) Compare against live

If this is a drill, decrypt at least one stored API key and confirm Torn API still accepts it:

```python
# inside container python
from cryptography.fernet import Fernet
import os, sqlite3, httpx
fernet = Fernet(os.environ["ENCRYPTION_KEY"].encode())
con = sqlite3.connect("/tmp/keys-restored.db")
row = con.execute("SELECT player_id, api_key_encrypted FROM api_keys LIMIT 1").fetchone()
key = fernet.decrypt(row[1]).decode()
print("PID", row[0], "key works:",
      httpx.get("https://api.torn.com/user/", params={"selections": "profile", "key": key}).json().get("player_id") == row[0])
```

## 5. Atomic swap (PRODUCTION RECOVERY ONLY)

**Take a maintenance window.** This is destructive.

```bash
# 1. Stop the app gracefully.
coolify-cli stop tm-hub  # or via UI

# 2. Backup the (presumably broken) current file just in case.
docker run --rm -v hub-data:/data alpine cp /data/keys.db /data/keys.db.broken-$(date +%Y%m%d-%H%M%S)

# 3. Copy the restored file in place.
docker run --rm -v hub-data:/data -v /tmp:/host alpine cp /host/keys-restored.db /data/keys.db

# 4. Start the app.
coolify-cli start tm-hub

# 5. Verify: log in as superadmin, check /admin/keys lists members.
```

## Quarterly restore drill (mandatory)

1. Spin up a fresh container locally with restored DB:
   ```bash
   python scripts/restore_keys_db.py --out /tmp/drill-keys.db
   ENCRYPTION_KEY=... JWT_SECRET=... \
       uvicorn api.main:app --port 9000 \
       # with /tmp/drill-keys.db copied to data/keys.db
   ```
2. Verify member count, sample 3 random members can be looked up.
3. Decrypt one API key and confirm Torn API still accepts it (step 4 above).
4. Delete the drill artifacts.
5. Record date + result in `docs/RESTORE_DRILL_LOG.md` (append-only).

## Troubleshooting

- **"BACKUP_ENCRYPTION_KEY env var required"** — the env var was rotated; check Coolify env. The key in B2 was the one active at backup time. If lost, that backup is unrecoverable; pick an older one or coordinate key escrow.
- **"InvalidToken" / Fernet decrypt fails** — wrong key for that backup, OR file corrupted. Try a different backup.
- **`b2sdk.exception.FileNotPresent`** — typo in `--remote` path. Re-run `--list`.
- **Mismatched schema after restore** — backup is older than current migrations. Run `runner.run_migrations()` post-restore.

## Defense in depth

- B2 access keys must NOT be the same identity that has write access to `data/`.
- Backup encryption key is rotated separately from `ENCRYPTION_KEY` and `JWT_SECRET`.
- `BACKUP_ENCRYPTION_KEY` should be stored OUTSIDE Coolify (e.g. in a password manager) so a Coolify compromise alone does not enable backup decryption.
