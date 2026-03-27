from __future__ import annotations

import os
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
