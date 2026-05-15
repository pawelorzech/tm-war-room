from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel as PydanticBaseModel

from api.config import SUPERADMIN_ID, SUPERADMIN_IDS, JWT_SECRET, APP_VERSION
from api.auth import create_jwt, require_bearer_token, rate_limiter, TOKEN_TYPE_ADMIN, TOKEN_TYPE_SESSION

logger = logging.getLogger("tm-hub.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Set by main.py during startup
_key_store = None
_analytics_store = None
_torn_client = None
_app_start_time: float | None = None
_settings_repo = None
_chat_repo = None
_chat_manager = None


def init(key_store, analytics_store, torn_client, app_start_time: float) -> None:
    global _key_store, _analytics_store, _torn_client, _app_start_time
    _key_store = key_store
    _analytics_store = analytics_store
    _torn_client = torn_client
    _app_start_time = app_start_time


def init_bots(chat_repo, chat_manager) -> None:
    global _chat_repo, _chat_manager
    _chat_repo = chat_repo
    _chat_manager = chat_manager


def _admin_bearer_or_cookie(request: Request) -> str:
    """Accept admin token from Authorization header (legacy) or tm_admin cookie (preferred)."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth
    cookie_token = request.cookies.get("tm_admin")
    if cookie_token:
        return f"Bearer {cookie_token}"
    return ""


def _session_bearer_or_cookie(request: Request) -> str:
    """Accept session token from Authorization header (legacy) or tm_session cookie."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth
    cookie_token = request.cookies.get("tm_session")
    if cookie_token:
        return f"Bearer {cookie_token}"
    return ""


async def require_admin(request: Request) -> dict:
    payload = require_bearer_token(
        _admin_bearer_or_cookie(request),
        JWT_SECRET,
        allowed_token_types=(TOKEN_TYPE_ADMIN,),
    )
    pid = payload["sub"]
    if pid not in SUPERADMIN_IDS and not _key_store.is_admin(pid):
        raise HTTPException(status_code=403, detail="Not an admin")
    if not rate_limiter.check(f"admin:{pid}", max_requests=60):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    payload["role"] = "superadmin" if pid in SUPERADMIN_IDS else "admin"
    return payload


async def require_superadmin(request: Request) -> dict:
    payload = await require_admin(request)
    if payload["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")
    return payload


async def _verify_torn_key_still_valid(player_id: int, api_key: str) -> bool:
    """F-06: re-validate the Torn API key against Torn before issuing an admin token.
    Mitigates stolen-session-token → automatic admin escalation: if the legitimate user
    revoked their key, the stolen session token can no longer escalate.
    """
    if _torn_client is None:
        return False
    try:
        # v1 profile (v2 nests under "profile" key; consumer below reads flat shape)
        resp = await _torn_client._http.get(
            "https://api.torn.com/user/",
            params={"selections": "profile", "key": api_key},
        )
        resp.raise_for_status()
        raw = resp.json()
        import inspect as _inspect
        if _inspect.isawaitable(raw):
            raw = await raw
    except Exception as exc:
        logger.warning("Admin re-auth: Torn API check failed for pid=%d: %s", player_id, exc)
        return False
    if "error" in raw:
        logger.warning("Admin re-auth: Torn API rejected key for pid=%d: %s", player_id, raw["error"])
        return False
    if raw.get("player_id") != player_id:
        logger.warning("Admin re-auth: key player_id mismatch (got %s, expected %d)", raw.get("player_id"), player_id)
        return False
    return True


@router.post("/session")
async def create_session(request: Request):
    from fastapi.responses import JSONResponse
    from api.config import APP_VERSION
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.check(f"session:{client_ip}", max_requests=5):
        raise HTTPException(status_code=429, detail="Too many attempts, try again later")
    payload = require_bearer_token(
        _session_bearer_or_cookie(request),
        JWT_SECRET,
        allowed_token_types=(TOKEN_TYPE_SESSION,),
    )
    player_id = payload["sub"]
    if player_id not in SUPERADMIN_IDS and not _key_store.is_admin(player_id):
        raise HTTPException(status_code=403, detail="Not an admin")
    user_key = _key_store.get_key(player_id)
    if not user_key:
        raise HTTPException(status_code=401, detail="No API key registered")
    # F-06: stolen session token alone is not enough — require the user's Torn key to still work.
    if not await _verify_torn_key_still_valid(player_id, user_key["api_key"]):
        raise HTTPException(status_code=401, detail="Re-validate your Torn API key — admin escalation requires a working key")
    token = create_jwt(player_id, user_key["player_name"], JWT_SECRET, token_type=TOKEN_TYPE_ADMIN)
    logger.info("Admin session created: %s [%d]", user_key["player_name"], player_id)
    response = JSONResponse(content={"token": token})
    response.set_cookie(
        key="tm_admin", value=token, max_age=86400,
        httponly=True, secure=(APP_VERSION != "dev"), samesite="strict", path="/",
    )
    return response


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


@router.get("/admins")
async def list_admins(admin: dict = Depends(require_admin)):
    admins = _key_store.get_admins()
    return {"admins": admins, "superadmin_id": SUPERADMIN_ID}


@router.post("/admins/{player_id}")
async def promote_admin(player_id: int, admin: dict = Depends(require_superadmin)):
    if not _key_store.has_key(player_id):
        raise HTTPException(status_code=404, detail="Player not registered")
    if player_id in SUPERADMIN_IDS:
        raise HTTPException(status_code=400, detail="Superadmin cannot be promoted")
    _key_store.promote_admin(player_id, admin["sub"])
    logger.info("Admin promoted: player %d by superadmin %d", player_id, admin["sub"])
    return {"status": "ok", "promoted": player_id}


@router.delete("/admins/{player_id}")
async def demote_admin(player_id: int, admin: dict = Depends(require_superadmin)):
    _key_store.demote_admin(player_id)
    logger.info("Admin demoted: player %d by superadmin %d", player_id, admin["sub"])
    return {"status": "ok", "demoted": player_id}


@router.post("/backup-keys-now")
async def backup_keys_now(admin: dict = Depends(require_superadmin)):
    """F-18: manual trigger for keys.db backup. Superadmin only."""
    from api.scheduler.jobs.backup_keys_db import run_backup_keys_db
    result = await run_backup_keys_db()
    logger.info("Manual keys.db backup triggered by superadmin %d: %s", admin["sub"], result)
    return result


@router.post("/stats/collect-now")
async def collect_stats_now(admin: dict = Depends(require_admin)):
    """Trigger immediate stat snapshot collection + background spy estimate refresh.

    Stats collection is awaited (fast — Torn API direct, members in parallel).
    Spy estimate refresh runs in the background because it's TornStats-paced
    (~1.1s/call) and may take minutes for a full backlog. Admin sees the
    member count immediately; the spy refresh trickles in async.
    """
    import asyncio
    from api.scheduler.engine import get_state
    from api.scheduler.jobs.collect_stats import collect_stat_snapshots
    from api.scheduler.jobs.refresh_stale_spies import (
        refresh_stale_estimates,
        MAX_PER_BULK,
    )
    state = get_state()
    if not state.get("key_repo") or not state.get("stats_repo") or not state.get("torn_client"):
        raise HTTPException(status_code=503, detail="Scheduler not initialized yet")
    await collect_stat_snapshots(state["key_repo"], state["stats_repo"], state["torn_client"])
    count = len(state["key_repo"].get_all_keys())
    logger.info("Manual stat collection triggered by admin %d", admin["sub"])

    # Fire-and-forget spy refresh so the admin doesn't wait minutes for the response.
    spy_service = state.get("spy_service")
    tornstats_key = state.get("tornstats_key", "")
    if spy_service and tornstats_key:
        async def _bg():
            try:
                result = await refresh_stale_estimates(
                    spy_service, state["torn_client"], tornstats_key,
                    max_per_run=MAX_PER_BULK,
                )
                logger.info(
                    "Background spy refresh after collect-now: refreshed=%d attempted=%d",
                    result["refreshed"], result["attempted"],
                )
            except Exception as e:
                logger.exception("Background spy refresh failed: %s", e)
        asyncio.create_task(_bg())
        return {
            "status": "ok",
            "message": f"Collected stats for {count} members; spy refresh started in background",
            "spy_refresh_started": True,
        }
    return {
        "status": "ok",
        "message": f"Collected stats for {count} members",
        "spy_refresh_started": False,
    }


@router.post("/spy/refresh-stale-now")
async def refresh_stale_spies_now(admin: dict = Depends(require_admin)):
    """Trigger an immediate bulk refresh of stale spy estimates.

    Awaits the refresh so the admin sees real counts back. With MAX_PER_BULK=500
    and 1.1s pacing this can take up to ~9 minutes — but most runs finish much
    faster because most rows are already fresh.
    """
    from api.scheduler.engine import get_state
    from api.scheduler.jobs.refresh_stale_spies import (
        refresh_stale_estimates,
        MAX_PER_BULK,
    )
    state = get_state()
    spy_service = state.get("spy_service")
    if not spy_service or not state.get("torn_client"):
        raise HTTPException(status_code=503, detail="Spy service not initialized yet")
    tornstats_key = state.get("tornstats_key", "")
    if not tornstats_key:
        raise HTTPException(status_code=503, detail="TORNSTATS_API_KEY not configured")
    result = await refresh_stale_estimates(
        spy_service, state["torn_client"], tornstats_key, max_per_run=MAX_PER_BULK,
    )
    logger.info(
        "Manual spy refresh by admin %d: refreshed=%d attempted=%d",
        admin["sub"], result["refreshed"], result["attempted"],
    )
    return {
        "status": "ok",
        "refreshed": result["refreshed"],
        "attempted": result["attempted"],
        "message": (
            f"Refreshed {result['refreshed']}/{result['attempted']} stale spy estimates"
            if result["attempted"] else "No stale spy estimates to refresh"
        ),
    }


class AnnouncementCreateBody(PydanticBaseModel):
    type: str
    message: str
    expires_at: str | None = None


class RevokeBody(PydanticBaseModel):
    reason: str | None = None


@router.post("/announcements")
async def create_announcement(body: AnnouncementCreateBody, admin: dict = Depends(require_admin)):
    if body.type not in ("alert", "warning", "info", "success"):
        raise HTTPException(status_code=400, detail="Invalid announcement type")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    ann_id = _key_store.create_announcement(
        type=body.type, message=body.message.strip(),
        created_by=admin["sub"], expires_at=body.expires_at,
    )
    logger.info("Announcement created: id=%d type=%s by admin %d", ann_id, body.type, admin["sub"])
    return {"status": "ok", "id": ann_id}


@router.patch("/announcements/{ann_id}/revoke")
async def revoke_announcement(ann_id: int, body: RevokeBody, admin: dict = Depends(require_admin)):
    changed = _key_store.revoke_announcement(ann_id, revoked_by=admin["sub"], reason=body.reason)
    if not changed:
        raise HTTPException(status_code=404, detail="Announcement not found or already revoked")
    logger.info("Announcement revoked: id=%d by admin %d reason=%s", ann_id, admin["sub"], body.reason)
    return {"status": "ok"}


class SettingUpdate(PydanticBaseModel):
    value: str


@router.get("/settings")
async def admin_get_settings(admin: dict = Depends(require_admin)):
    if not _settings_repo:
        raise HTTPException(status_code=503, detail="Settings not initialized")
    return _settings_repo.get_all()


@router.put("/settings/{key}")
async def admin_update_setting(key: str, body: SettingUpdate, admin: dict = Depends(require_admin)):
    if not _settings_repo:
        raise HTTPException(status_code=503, detail="Settings not initialized")
    current = _settings_repo.get(key)
    if current is None:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    _settings_repo.set(key, body.value, updated_by=admin["sub"])
    logger.info("Setting '%s' changed to '%s' by admin %d", key, body.value, admin["sub"])
    return {"status": "ok", "key": key, "value": body.value}


@router.get("/bots")
async def admin_list_bots(admin: dict = Depends(require_admin)):
    """List all chat bots for admin panel."""
    if not _chat_repo:
        raise HTTPException(status_code=503, detail="Chat not initialized")
    return {"bots": _chat_repo.get_bots()}


@router.post("/bots/trigger/revive-monitor")
async def trigger_revive_monitor(admin: dict = Depends(require_admin)):
    """Manually trigger the revive monitor bot."""
    if not _chat_repo:
        raise HTTPException(status_code=503, detail="Chat not initialized")
    from api.scheduler.jobs.refresh_data import war_active
    from api.bots.revive_monitor import run
    result = await run(
        torn_client=_torn_client,
        chat_repo=_chat_repo,
        chat_manager=_chat_manager,
        war_active=war_active,
        force=True,
    )
    logger.info("Revive monitor manually triggered by admin %d: %s", admin["sub"], result)
    return result


@router.get("/bots/revive-monitor/settings")
async def get_revive_monitor_settings(admin: dict = Depends(require_admin)):
    """Get revive monitor interval settings."""
    from api.db.repos.settings import AppSettingsRepository
    from api.bots.revive_monitor import DEFAULT_PEACE_INTERVAL, DEFAULT_WAR_INTERVAL
    settings = AppSettingsRepository(db_path="data/keys.db")
    return {
        "peace_interval": int(settings.get("revive_monitor_peace_interval") or DEFAULT_PEACE_INTERVAL),
        "war_interval": int(settings.get("revive_monitor_war_interval") or DEFAULT_WAR_INTERVAL),
    }


@router.put("/bots/revive-monitor/settings")
async def update_revive_monitor_settings(request: Request, admin: dict = Depends(require_admin)):
    """Update revive monitor interval settings."""
    from api.db.repos.settings import AppSettingsRepository
    body = await request.json()
    settings = AppSettingsRepository(db_path="data/keys.db")
    updated = {}
    if "peace_interval" in body:
        val = max(60, min(86400, int(body["peace_interval"])))  # 1min–24h
        settings.set("revive_monitor_peace_interval", str(val), updated_by=admin["sub"])
        updated["peace_interval"] = val
    if "war_interval" in body:
        val = max(0, min(3600, int(body["war_interval"])))  # 0 (no throttle)–1h
        settings.set("revive_monitor_war_interval", str(val), updated_by=admin["sub"])
        updated["war_interval"] = val
    logger.info("Revive monitor settings updated by admin %d: %s", admin["sub"], updated)
    return {"ok": True, **updated}


@router.get("/scheduler/status")
async def scheduler_status(request: Request, admin: dict = Depends(require_admin)):
    """Health snapshot of the background scheduler.

    Returns leadership state of *this* worker plus per-task last-run timestamps
    populated from APScheduler's JobReleased event. Use as a curl/cron canary
    to detect "scheduler died and nothing fires anymore" without DM from users.
    """
    from api.scheduler.engine import get_last_run_at
    le = getattr(request.app.state, "leader_election", None)
    is_leader = bool(le.is_leader) if le is not None else bool(
        getattr(request.app.state, "is_scheduler_leader", False)
    )
    return {
        "is_leader": is_leader,
        "owner_id": le._owner_id if le is not None else None,
        "last_run_at": get_last_run_at(),
    }
