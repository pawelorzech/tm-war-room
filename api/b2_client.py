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


def upload_private_bytes(remote_path: str, data: bytes, content_type: str) -> str:
    """Upload without public cache headers — for backups / non-public assets (F-18)."""
    api = _get_api()
    bucket = api.get_bucket_by_name(_BUCKET_NAME)
    bucket.upload_bytes(data, remote_path, content_type=content_type)
    return remote_path


def list_files(prefix: str) -> list[dict]:
    """Return list of {file_name, file_id, upload_timestamp_ms, size} for files
    matching prefix (latest version of each)."""
    api = _get_api()
    bucket = api.get_bucket_by_name(_BUCKET_NAME)
    out: list[dict] = []
    for file_version, _folder_name in bucket.ls(prefix, latest_only=True, recursive=True):
        out.append({
            "file_name": file_version.file_name,
            "file_id": file_version.id_,
            "upload_timestamp_ms": file_version.upload_timestamp,
            "size": file_version.size,
        })
    return out


def delete_file(file_name: str, file_id: str) -> None:
    api = _get_api()
    bucket = api.get_bucket_by_name(_BUCKET_NAME)
    bucket.delete_file_version(file_id, file_name)


def download_to_path(remote_path: str, local_path: str) -> None:
    """Download remote_path to local_path. Used by restore tooling."""
    api = _get_api()
    bucket = api.get_bucket_by_name(_BUCKET_NAME)
    downloaded = bucket.download_file_by_name(remote_path)
    downloaded.save_to(local_path)
