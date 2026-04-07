from __future__ import annotations
import os
import logging

logger = logging.getLogger("tm-hub.b2")

_KEY_ID = os.getenv("B2_APPLICATION_KEY_ID", "")
_KEY = os.getenv("B2_APPLICATION_KEY", "")
_BUCKET_NAME = os.getenv("B2_BUCKET_NAME", "tmhubmedia")
_PUBLIC_URL = os.getenv("B2_PUBLIC_URL", "").rstrip("/")


def is_configured() -> bool:
    return bool(_KEY_ID and _KEY and _PUBLIC_URL)


def _get_api():
    from b2sdk.v2 import B2Api, InMemoryAccountInfo
    info = InMemoryAccountInfo()
    api = B2Api(info)
    api.authorize_account("production", _KEY_ID, _KEY)
    return api


def upload_bytes(remote_path: str, data: bytes, content_type: str) -> str:
    api = _get_api()
    bucket = api.get_bucket_by_name(_BUCKET_NAME)
    bucket.upload_bytes(
        data, remote_path,
        content_type=content_type,
        cache_control="public, max-age=86400",
    )
    return f"{_PUBLIC_URL}/{remote_path}"
