from __future__ import annotations

import inspect
import time

from fastapi import APIRouter, HTTPException, Header, Depends, Request, Query

from app.config import ADMIN_PLAYER_IDS, JWT_SECRET, APP_VERSION
from app.auth import create_jwt, decode_jwt, rate_limiter

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Set by main.py during startup
_key_store = None
_analytics_store = None
_torn_client = None
_app_start_time: float | None = None


def init(key_store, analytics_store, torn_client, app_start_time: float) -> None:
    global _key_store, _analytics_store, _torn_client, _app_start_time
    _key_store = key_store
    _analytics_store = analytics_store
    _torn_client = torn_client
    _app_start_time = app_start_time


async def require_admin(request: Request) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization")
    token = auth_header[7:]
    payload = decode_jwt(token, JWT_SECRET)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload["sub"] not in ADMIN_PLAYER_IDS:
        raise HTTPException(status_code=403, detail="Not an admin")
    if not rate_limiter.check(f"admin:{payload['sub']}", max_requests=60):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    return payload


@router.post("/session")
async def create_session(x_player_id: int = Header()):
    if not rate_limiter.check(f"session:{x_player_id}", max_requests=5):
        raise HTTPException(status_code=429, detail="Too many attempts, try again later")
    if x_player_id not in ADMIN_PLAYER_IDS:
        raise HTTPException(status_code=403, detail="Not an admin")
    all_keys = _key_store.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    if not user_key:
        raise HTTPException(status_code=401, detail="No API key registered")
    # Verify identity via Torn API
    resp = await _torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "profile", "key": user_key["api_key"]},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw or raw.get("player_id") != x_player_id:
        raise HTTPException(status_code=401, detail="API key verification failed")
    token = create_jwt(x_player_id, user_key["player_name"], JWT_SECRET)
    return {"token": token}


@router.get("/keys")
async def admin_list_keys(admin: dict = Depends(require_admin)):
    keys_meta = _key_store.get_keys_metadata()
    members = await _torn_client.fetch_members()
    return {
        "keys": keys_meta,
        "registered_count": len(keys_meta),
        "total_faction_members": len(members),
    }


@router.delete("/keys/{player_id}")
async def admin_delete_key(player_id: int, admin: dict = Depends(require_admin)):
    if player_id == admin["sub"]:
        raise HTTPException(status_code=403, detail="Cannot delete your own key via admin panel")
    _key_store.delete_key(player_id=player_id)
    return {"status": "ok", "deleted_player_id": player_id, "deleted_by": admin["sub"]}


@router.get("/stats/requests")
async def admin_request_stats(days: int = Query(default=7, ge=1, le=30), admin: dict = Depends(require_admin)):
    return _analytics_store.get_request_stats(days=days)


@router.get("/stats/users")
async def admin_user_stats(days: int = Query(default=7, ge=1, le=30), admin: dict = Depends(require_admin)):
    raw_users = _analytics_store.get_user_stats(days=days)
    keys_meta = _key_store.get_keys_metadata()
    name_map = {k["player_id"]: k["player_name"] for k in keys_meta}
    for u in raw_users:
        u["player_name"] = name_map.get(u["player_id"], f"Unknown ({u['player_id']})")
    return {"users": raw_users}


@router.get("/stats/errors")
async def admin_error_stats(days: int = Query(default=7, ge=1, le=30), admin: dict = Depends(require_admin)):
    return {"errors": _analytics_store.get_error_stats(days=days)}


@router.get("/system")
async def admin_system(admin: dict = Depends(require_admin)):
    uptime = time.time() - _app_start_time if _app_start_time else 0
    cache_entries = len(_torn_client._cache) if _torn_client else 0
    cache_times = [ts for ts, _ in _torn_client._cache.values()] if _torn_client and _torn_client._cache else []
    last_refresh = max(cache_times) if cache_times else None

    integrations = _analytics_store.get_integration_status() if _analytics_store else {}
    for svc in ("torn_api", "tornstats", "yata"):
        if svc not in integrations:
            integrations[svc] = {"status": "unknown", "last_success": None, "last_error": None, "last_error_at": None}

    return {
        "uptime_seconds": int(uptime),
        "version": APP_VERSION,
        "cache": {
            "entries": cache_entries,
            "last_refresh": last_refresh,
        },
        "integrations": integrations,
    }
