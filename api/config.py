from __future__ import annotations

import logging
import os
import secrets as _secrets
from cryptography.fernet import Fernet

logger = logging.getLogger("tm-hub.config")

TORN_API_KEY: str = os.environ.get("TORN_API_KEY", "")
FACTION_ID: int = int(os.environ.get("FACTION_ID", "11559"))
CACHE_TTL: int = int(os.environ.get("CACHE_TTL", "60"))
TORNSTATS_API_KEY: str = os.environ.get("TORNSTATS_API_KEY", "")

_is_production = os.environ.get("APP_VERSION", "dev") != "dev"

_enc_key = os.environ.get("ENCRYPTION_KEY")
if not _enc_key:
    if _is_production:
        raise RuntimeError("ENCRYPTION_KEY must be set in production")
    _enc_key = Fernet.generate_key().decode()
    logger.warning("No ENCRYPTION_KEY set — using ephemeral key (dev mode only)")

ENCRYPTION_KEY: str = _enc_key

# Superadmins: env-var allowlist (comma-separated). Falls back to historical hardcoded value.
# SUPERADMIN_ID stays for code paths that need a single canonical ID (e.g. created_by columns);
# SUPERADMIN_IDS is used for authorization checks so a backup admin can be added without code change.
_superadmin_ids_raw = os.environ.get("SUPERADMIN_IDS", "2362436")
SUPERADMIN_IDS: frozenset[int] = frozenset(
    int(x.strip()) for x in _superadmin_ids_raw.split(",") if x.strip().lstrip("-").isdigit()
)
if not SUPERADMIN_IDS:
    raise RuntimeError("SUPERADMIN_IDS must contain at least one player_id")
SUPERADMIN_ID: int = min(SUPERADMIN_IDS)  # canonical (smallest ID — Bombel by default)

_jwt_secret = os.environ.get("JWT_SECRET", "")
if not _jwt_secret:
    if _is_production:
        raise RuntimeError("JWT_SECRET must be set in production")
    _jwt_secret = _secrets.token_urlsafe(32)
    logger.warning("No JWT_SECRET set — using ephemeral secret (dev mode only)")

JWT_SECRET: str = _jwt_secret
APP_VERSION: str = os.environ.get("APP_VERSION", "dev")

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_MAILTO = os.environ.get("VAPID_MAILTO", "mailto:admin@tri.ovh")

MCP_SECRET: str = os.environ.get("MCP_SECRET", "")
