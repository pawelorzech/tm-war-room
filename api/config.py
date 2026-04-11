from __future__ import annotations

import os
import secrets as _secrets
from cryptography.fernet import Fernet


TORN_API_KEY: str = os.environ.get("TORN_API_KEY", "")
FACTION_ID: int = int(os.environ.get("FACTION_ID", "11559"))
CACHE_TTL: int = int(os.environ.get("CACHE_TTL", "60"))
TORNSTATS_API_KEY: str = os.environ.get("TORNSTATS_API_KEY", "")

_enc_key = os.environ.get("ENCRYPTION_KEY")
if not _enc_key:
    _enc_key = Fernet.generate_key().decode()
    print("WARNING: No ENCRYPTION_KEY set. Generated ephemeral key. Keys will be lost on restart.")

ENCRYPTION_KEY: str = _enc_key

SUPERADMIN_ID: int = 2362436  # Bombel

_jwt_secret = os.environ.get("JWT_SECRET", "")
if not _jwt_secret:
    _jwt_secret = _secrets.token_urlsafe(32)
    print("WARNING: No JWT_SECRET set. Generated ephemeral secret. Admin sessions will be lost on restart.")

JWT_SECRET: str = _jwt_secret
APP_VERSION: str = os.environ.get("APP_VERSION", "dev")

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_MAILTO = os.environ.get("VAPID_MAILTO", "mailto:admin@tri.ovh")

MCP_SECRET: str = os.environ.get("MCP_SECRET", "")
