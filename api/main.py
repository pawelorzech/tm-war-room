from __future__ import annotations

import inspect
import json
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("tm-hub")

from api.analytics import AnalyticsStore
from api.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY, SUPERADMIN_ID, JWT_SECRET
from api.torn_client import TornClient
from api.auth import create_jwt
from api.db import KeyStore
from api.threat import compute_threat, compute_stat_threat
from api.admin import router as admin_router
import api.admin as admin_mod
from api.routers.spy import router as spy_router
import api.routers.spy as spy_mod
from api.routers.stats import router as stats_router
import api.routers.stats as stats_mod
from api.routers.market import router as market_router
import api.routers.market as market_mod
from api.routers.chain import router as chain_router
import api.routers.chain as chain_mod
from api.routers.awards import router as awards_router
import api.routers.awards as awards_mod
from api.routers.targets import router as targets_router
import api.routers.targets as targets_mod
from api.routers.loot import router as loot_router
import api.routers.loot as loot_mod
from api.routers.revives import router as revives_router
import api.routers.revives as revives_mod
from api.routers.stocks import router as stocks_router
import api.routers.stocks as stocks_mod
from api.routers.travel import router as travel_router
import api.routers.travel as travel_mod
from api.routers.oc import router as oc_router
import api.routers.oc as oc_mod
from api.routers.wars import router as wars_router
import api.routers.wars as wars_mod
from api.routers.stakeout import router as stakeout_router
import api.routers.stakeout as stakeout_mod
from api.routers.bounties import router as bounties_router
import api.routers.bounties as bounties_mod
from api.routers.notifications import router as notifications_router
import api.routers.notifications as notifications_mod
from api.routers.company import router as company_router
import api.routers.company as company_mod
from api.routers.push import router as push_router
import api.routers.push as push_mod
from api.routers.version import router as version_router
import api.routers.version as version_mod
from api.routers.chat import router as chat_router
import api.routers.chat as chat_mod
from api.routers.armoury import router as armoury_router
import api.routers.armoury as armoury_mod
from api.mcp import mcp as mcp_server, set_services as mcp_set_services, get_mcp_middleware

torn_client: TornClient | None = None
key_store: KeyStore | None = None
analytics_store = None
presence_repo = None  # PresenceRepository, set in lifespan


@asynccontextmanager
async def lifespan(app: FastAPI):
    global torn_client, key_store, analytics_store, presence_repo
    os.makedirs("data", exist_ok=True)
    analytics_store = AnalyticsStore(db_path="data/analytics.db")
    analytics_store.cleanup(days=30)
    torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL, analytics_store=analytics_store)
    key_store = KeyStore(db_path="data/keys.db", encryption_key=ENCRYPTION_KEY)
    admin_mod.init(key_store, analytics_store, torn_client, time.time())
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(db_path="data/keys.db")
    spy_mod.spy_service = SpyService(spy_repo)
    spy_mod.torn_client = torn_client
    spy_mod.tornstats_key = TORNSTATS_API_KEY

    from api.db.repos.stats import StatSnapshotRepository
    stats_repo = StatSnapshotRepository(db_path="data/keys.db")
    stats_mod.stats_repo = stats_repo
    stats_mod.key_repo = key_store._keys
    stats_mod.torn_client = torn_client
    market_mod.torn_client = torn_client

    from api.db.repos.attacks import AttackRepository
    attack_repo = AttackRepository(db_path="data/keys.db")
    chain_mod.attack_repo = attack_repo
    chain_mod.torn_client = torn_client

    awards_mod.torn_client = torn_client
    awards_mod.key_store = key_store
    from api.db.repos.circulation import CirculationRepository
    awards_mod.circulation_repo = CirculationRepository(db_path="data/keys.db")

    from api.db.repos.targets import TargetRepository
    target_repo = TargetRepository(db_path="data/keys.db")
    targets_mod.target_repo = target_repo
    targets_mod.key_store = key_store

    loot_mod.torn_client = torn_client
    loot_mod.tornstats_key = TORNSTATS_API_KEY
    from api.db.repos.loot_reservations import LootReservationRepository
    loot_mod.reservation_repo = LootReservationRepository(db_path="data/keys.db")
    loot_mod.key_store = key_store
    revives_mod.torn_client = torn_client
    from api.db.repos.history import HistoryRepository
    history_repo_inst = HistoryRepository(db_path="data/keys.db")
    stocks_mod.torn_client = torn_client
    stocks_mod.key_store = key_store
    stocks_mod.history_repo = history_repo_inst
    travel_mod.torn_client = torn_client
    oc_mod.torn_client = torn_client
    wars_mod.torn_client = torn_client

    from api.db.repos.stakeouts import StakeoutRepository
    stakeout_repo = StakeoutRepository(db_path="data/keys.db")
    stakeout_mod.stakeout_repo = stakeout_repo
    stakeout_mod.key_store = key_store
    bounties_mod.torn_client = torn_client
    bounties_mod.key_store = key_store
    bounties_mod.spy_service = spy_mod.spy_service

    from api.db.repos.notifications import NotificationRepository
    notification_repo = NotificationRepository(db_path="data/keys.db")
    notifications_mod.notification_repo = notification_repo
    notifications_mod.key_store = key_store
    company_mod.torn_client = torn_client
    company_mod.key_store = key_store

    from api.db.repos.push_repository import PushRepository
    push_repo = PushRepository(db_path="data/keys.db")
    push_mod.push_repo = push_repo
    from api.config import VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_MAILTO
    push_mod.vapid_public_key = VAPID_PUBLIC_KEY

    from api.push_service import PushService
    push_service = PushService(
        push_repo=push_repo,
        notification_repo=notification_repo,
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={"sub": VAPID_MAILTO} if VAPID_PRIVATE_KEY else {},
    )
    push_mod.push_service = push_service

    from api.db.repos.presence_repository import PresenceRepository
    presence_repo = PresenceRepository(db_path="data/keys.db")

    from api.db.repos.notification_templates import NotificationTemplateRepository
    from api.db.repos.notification_events import NotificationEventRepository
    from api.db.repos.custom_groups import CustomGroupRepository
    from api.notification_dispatcher import NotificationDispatcher

    template_repo = NotificationTemplateRepository(db_path="data/keys.db")
    event_repo = NotificationEventRepository(db_path="data/keys.db")
    group_repo = CustomGroupRepository(db_path="data/keys.db")
    push_mod.event_repo = event_repo

    notification_dispatcher = NotificationDispatcher(
        push_service=push_service,
        push_repo=push_repo,
        event_repo=event_repo,
        group_repo=group_repo,
        key_store=key_store,
    )

    from api.routers import admin_push as admin_push_mod
    admin_push_mod.template_repo = template_repo
    admin_push_mod.event_repo = event_repo
    admin_push_mod.group_repo = group_repo
    admin_push_mod.dispatcher = notification_dispatcher
    chat_mod.notification_dispatcher = notification_dispatcher
    chat_mod.torn_client = torn_client

    from api.db.repos.armoury import ArmouryRepository
    armoury_repo = ArmouryRepository(db_path="data/keys.db")
    armoury_mod.repo = armoury_repo
    armoury_mod.torn_client = torn_client
    armoury_mod.key_store = key_store

    from api.db.repos.version_dismissals import VersionDismissalRepository
    version_mod.dismissal_repo = VersionDismissalRepository(db_path="data/keys.db")

    from api.db.repos.chat import ChatRepository
    from api.chat_manager import ChatManager
    chat_repo = ChatRepository(db_path="data/keys.db")
    chat_mgr = ChatManager()
    chat_mod.chat_repo = chat_repo
    chat_mod.chat_manager = chat_mgr
    chat_mod.key_store = key_store
    chat_mod.push_service = push_service
    chat_mod.presence_repo = presence_repo
    from api.db.repos.settings import AppSettingsRepository
    settings_repo = AppSettingsRepository(db_path="data/keys.db")
    chat_mod.settings_repo = settings_repo
    admin_mod._settings_repo = settings_repo
    admin_mod.init_bots(chat_repo, chat_mgr)

    # Auto-provision Revive Monitor bot and channel
    from api.bots import revive_monitor as revive_bot_mod
    _revive_channel = chat_repo.get_channel_by_name("revives")
    if not _revive_channel:
        _revive_ch_id = chat_repo.create_channel(
            name="revives", description="Revive status warnings from the bot",
            ch_type="chat", position=99, admin_only=False, created_by=SUPERADMIN_ID,
        )
        logger.info("Auto-created 'revives' chat channel (id=%d)", _revive_ch_id)
        _revive_channel = chat_repo.get_channel(_revive_ch_id)

    _revive_bot = chat_repo.get_bot_by_name("Revive Monitor")
    if not _revive_bot:
        import uuid as _uuid
        _bot_token = str(_uuid.uuid4())
        _bot_id = chat_repo.create_bot(
            name="Revive Monitor", token=_bot_token,
            allowed_channels=json.dumps([_revive_channel["id"]]),
            created_by=SUPERADMIN_ID,
        )
        logger.info("Auto-created 'Revive Monitor' bot (id=%d)", _bot_id)

    # Wire up revive_monitor notify function
    from api.routers.chat import _notify_mentions
    revive_bot_mod._notify_mentions_fn = _notify_mentions

    # MCP service registry — expose repos/client to MCP tools
    mcp_set_services(
        torn_client=torn_client,
        key_store=key_store,
        armoury_repo=armoury_repo,
        spy_service=spy_mod.spy_service,
        spy_repo=spy_repo,
        target_repo=target_repo,
        attack_repo=attack_repo,
        stats_repo=stats_repo,
        stakeout_repo=stakeout_repo,
        chat_repo=chat_repo,
        notification_repo=notification_repo,
        notification_dispatcher=notification_dispatcher,
        tornstats_key=TORNSTATS_API_KEY,
    )

    from api.scheduler.engine import create_and_start_scheduler
    app_scheduler = await create_and_start_scheduler({
        "key_repo": key_store._keys,
        "stats_repo": stats_repo,
        "spy_service": spy_mod.spy_service,
        "torn_client": torn_client,
        "tornstats_key": TORNSTATS_API_KEY,
        "attack_repo": attack_repo,
        "history_repo": history_repo_inst,
        "notification_repo": notification_repo,
        "push_service": push_service,
        "notification_dispatcher": notification_dispatcher,
        "chat_repo": chat_repo,
        "chat_manager": chat_mgr,
        "armoury_repo": armoury_repo,
    })
    from api import b2_client
    if b2_client.is_configured():
        import asyncio as _asyncio
        async def _startup_avatar_refresh():
            from api.scheduler.jobs.refresh_avatars import run_refresh_avatars
            try:
                await run_refresh_avatars()
            except Exception as e:
                logger.warning("Startup avatar refresh failed: %s", e)
        _asyncio.create_task(_startup_avatar_refresh())

    logger.info("TM Hub started — superadmin=%d, faction=%d, scheduler active", SUPERADMIN_ID, FACTION_ID)
    yield
    await chat_mgr.close_all()
    await app_scheduler.__aexit__(None, None, None)
    await torn_client.close()
    logger.info("TM Hub shutting down")


app = FastAPI(title="TM Hub", lifespan=lifespan)
app.include_router(admin_router)
from api.routers.admin_push import router as admin_push_router
app.include_router(admin_push_router)
app.include_router(spy_router)
app.include_router(stats_router)
app.include_router(market_router)
app.include_router(chain_router)
app.include_router(awards_router)
app.include_router(targets_router)
app.include_router(loot_router)
app.include_router(revives_router)
app.include_router(stocks_router)
app.include_router(travel_router)
app.include_router(oc_router)
app.include_router(wars_router)
app.include_router(stakeout_router)
app.include_router(bounties_router)
app.include_router(notifications_router)
app.include_router(company_router)
app.include_router(push_router)
app.include_router(version_router)
app.include_router(chat_router)
app.include_router(armoury_router)

# MCP server (Streamable HTTP transport)
app.mount("/mcp", mcp_server.http_app(path="/", stateless_http=True, middleware=get_mcp_middleware()))

@app.get("/api/settings/public")
async def public_settings():
    from api.db.repos.settings import AppSettingsRepository
    repo = AppSettingsRepository(db_path="data/keys.db")
    return repo.get_public()


@app.post("/api/admin/refresh-avatars")
async def admin_refresh_avatars(request: Request):
    """Manually trigger avatar refresh (superadmin only) with diagnostics."""
    pid = request.headers.get("x-player-id")
    if str(pid) != str(SUPERADMIN_ID):
        raise HTTPException(status_code=403, detail="Forbidden")
    from api import b2_client
    from api.scheduler.engine import get_state
    diag = {
        "b2_configured": b2_client.is_configured(),
        "b2_key_id": bool(b2_client._KEY_ID),
        "b2_key": bool(b2_client._KEY),
        "b2_url": b2_client._PUBLIC_URL or "(empty)",
    }
    if not b2_client.is_configured():
        return {"error": "B2 not configured", **diag}
    state = get_state()
    diag["has_key_repo"] = "key_repo" in state
    diag["has_torn_client"] = "torn_client" in state
    key_repo = state.get("key_repo")
    if key_repo:
        fk = key_repo.get_faction_key()
        diag["has_faction_key"] = fk is not None
        diag["member_count"] = len(key_repo.get_all_keys())
    try:
        from api.scheduler.jobs.refresh_avatars import run_refresh_avatars
        await run_refresh_avatars()
        if key_repo:
            diag["avatars_after"] = len(key_repo.get_avatar_map())
        return {"ok": True, **diag}
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc(), **diag}


@app.get("/api/status")
async def app_status():
    """System status including war detection for adaptive polling."""
    from api.scheduler.jobs.refresh_data import war_active, last_full_refresh, _cycle
    return {
        "war_active": war_active,
        "poll_interval": 15 if war_active else 60,
        "last_refresh": int(last_full_refresh),
        "refresh_cycle": _cycle,
    }


CANONICAL_HOST = "hub.tri.ovh"
REDIRECT_HOSTS = {"rw.tri.ovh", "train.tri.ovh"}


@app.middleware("http")
async def redirect_old_domains(request: Request, call_next):
    host = request.headers.get("host", "").split(":")[0]
    if host in REDIRECT_HOSTS:
        path = "/team" if host.startswith("rw") else "/training"
        return RedirectResponse(
            url=f"https://{CANONICAL_HOST}{path}",
            status_code=301,
        )
    return await call_next(request)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    if not request.url.path.startswith("/api/"):
        return await call_next(request)
    start = time.time()
    player_id_raw = request.headers.get("x-player-id")
    pid = int(player_id_raw) if player_id_raw and player_id_raw.isdigit() else None
    try:
        response = await call_next(request)
    except Exception as e:
        elapsed_ms = (time.time() - start) * 1000
        logger.error("UNHANDLED %s %s pid=%s %.0fms — %s", request.method, request.url.path, pid, elapsed_ms, e)
        raise
    elapsed_ms = (time.time() - start) * 1000
    if response.status_code >= 500:
        logger.error("HTTP %d %s %s pid=%s %.0fms", response.status_code, request.method, request.url.path, pid, elapsed_ms)
    elif response.status_code >= 400:
        logger.warning("HTTP %d %s %s pid=%s %.0fms", response.status_code, request.method, request.url.path, pid, elapsed_ms)
    elif elapsed_ms > 2000:
        logger.warning("SLOW %s %s pid=%s %.0fms", request.method, request.url.path, pid, elapsed_ms)
    if analytics_store:
        try:
            analytics_store.log_request(pid, request.method, request.url.path, response.status_code, elapsed_ms)
        except Exception:
            pass
    return response


def get_role(player_id: int) -> str:
    if player_id == SUPERADMIN_ID:
        return "superadmin"
    if key_store.is_admin(player_id):
        return "admin"
    return "member"


@app.get("/api/me")
async def me(x_player_id: int = Header()):
    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    role = get_role(x_player_id)
    return {
        "player_id": x_player_id,
        "role": role,
        "is_admin": role in ("admin", "superadmin"),
        "is_superadmin": role == "superadmin",
    }


async def verify_member(x_player_id: int = Header()):
    """Check that the requesting player has a registered key."""
    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


def _build_war_progress(war) -> dict | None:
    if not war or not war.war_id:
        return None
    us = next((f for f in war.factions if f.id == FACTION_ID), None)
    them = next((f for f in war.factions if f.id != FACTION_ID), None)
    if not us or not them:
        return None
    target = war.target or 0
    return {
        "war_id": war.war_id, "start": war.start, "end": war.end, "target": target,
        "our_score": us.score, "their_score": them.score,
        "our_name": us.name, "their_name": them.name,
        "our_id": us.id, "their_id": them.id,
        "our_pct": min(100.0, (us.score / target * 100)) if target else 0,
        "their_pct": min(100.0, (them.score / target * 100)) if target else 0,
    }


def _get_active_api_key() -> str:
    """Use faction key if available, otherwise fall back to env var."""
    fk = key_store.get_faction_key()
    return fk["api_key"] if fk else TORN_API_KEY


@app.get("/api/overview")
async def overview(_=Depends(verify_member)):
    active_key = _get_active_api_key()
    members = await torn_client.fetch_members(api_key=active_key)
    war = await torn_client.fetch_war(api_key=active_key)
    chain = await torn_client.fetch_chain(api_key=active_key)
    return {
        "members": [m.model_dump() for m in members],
        "war": war.model_dump() if war else None,
        "war_progress": _build_war_progress(war),
        "chain": chain,
        "cached_at": int(time.time()),
    }


FULL_ACCESS_POSITIONS = {"Leader", "Co-leader", "Council", "API", "Leadership"}
SELF_ONLY_POSITIONS = {"Team 1", "Team 2", "Team 3", "Team 4", "Member", "Contact"}


@app.get("/api/members/detail")
async def members_detail(x_player_id: int = Header()):
    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")

    all_keys = key_store.get_all_keys()
    active_key = _get_active_api_key()
    members = await torn_client.fetch_members(api_key=active_key)
    member_map = {m.id: m for m in members}

    requesting_member = member_map.get(x_player_id)
    if not requesting_member:
        return {"yata_down": False, "members": {}, "cached_at": int(time.time())}
    position = requesting_member.position
    if position in FULL_ACCESS_POSITIONS:
        visible_ids = set(member_map.keys())
    elif position in SELF_ONLY_POSITIONS:
        visible_ids = {x_player_id}
    else:
        return {"yata_down": False, "members": {}, "cached_at": int(time.time())}

    # Fetch YATA data (single attempt with one fallback key, no loop)
    yata_data = await torn_client.fetch_yata_members(api_key=active_key)
    if yata_data is None and all_keys:
        fallback_key = next((k["api_key"] for k in all_keys if k["api_key"] != active_key), None)
        if fallback_key:
            yata_data = await torn_client.fetch_yata_members(api_key=fallback_key)
    yata_down = yata_data is None

    # Fetch per-key data for registered members (parallel)
    import asyncio
    visible_keys = [(e["player_id"], e["api_key"]) for e in all_keys if e["player_id"] in visible_ids]

    async def _fetch_bars(pid: int, api_key: str) -> tuple[int, Any]:
        try:
            bars = await torn_client.fetch_member_bars(api_key)
            return pid, bars
        except Exception:
            return pid, None

    bar_results = await asyncio.gather(*[_fetch_bars(pid, key) for pid, key in visible_keys])
    per_key = {pid: bars for pid, bars in bar_results if bars is not None}

    # Merge: per-key wins, then YATA, then status flags
    result = {}
    for pid in visible_ids:
        pid_str = str(pid)
        if pid in per_key:
            bars = per_key[pid]
            result[pid_str] = {
                "energy": bars.energy.current,
                "max_energy": bars.energy.maximum,
                "drug_cd": bars.cooldowns.drug,
                "refill": False,
                "source": "torn_api",
            }
        elif yata_data and pid_str in yata_data:
            ym = yata_data[pid_str]
            share = ym.get("energy_share", 0)
            if share == 1:
                result[pid_str] = {
                    "energy": ym.get("energy", 0),
                    "max_energy": None,
                    "drug_cd": ym.get("drug_cd", 0),
                    "refill": ym.get("refill", False),
                    "source": "yata",
                }
            elif share == -1:
                result[pid_str] = {
                    "energy": 0, "max_energy": None,
                    "drug_cd": 0, "refill": False,
                    "source": "hidden",
                }
            else:
                result[pid_str] = {
                    "energy": 0, "max_energy": None,
                    "drug_cd": 0, "refill": False,
                    "source": "not_on_yata",
                }
        else:
            result[pid_str] = {
                "energy": 0, "max_energy": None,
                "drug_cd": 0, "refill": False,
                "source": "not_on_yata" if not yata_down else "unavailable",
            }

    return {"yata_down": yata_down, "members": result, "cached_at": int(time.time())}


@app.get("/api/enemy")
async def enemy(faction_id: int | None = Query(default=None), baseline_pid: int | None = Query(default=None), _=Depends(verify_member)):
    enemy_id = faction_id
    if not enemy_id:
        war = await torn_client.fetch_war()
        if war and war.factions:
            enemy_faction = next((f for f in war.factions if f.id != FACTION_ID), None)
            if enemy_faction:
                enemy_id = enemy_faction.id
    if not enemy_id:
        return {"faction": None, "members": [], "cached_at": int(time.time())}

    members = await torn_client.fetch_enemy_members(enemy_id)
    info = await torn_client.fetch_faction_info(enemy_id)

    spy_data = {}
    if TORNSTATS_API_KEY:
        try:
            spy_data = await torn_client.fetch_tornstats_spy(enemy_id, TORNSTATS_API_KEY)
        except Exception:
            pass

    # Look up spy estimates for better threat scoring
    spy_estimates = {}
    if spy_mod.spy_service:
        for m in members:
            est = spy_mod.spy_service.repo.get_estimate(m.id)
            if est:
                spy_estimates[m.id] = est

    # Get baseline stats from the requesting user's key for relative threat scoring
    baseline = None
    baseline_name = None
    if baseline_pid:
        user_key = key_store.get_key(baseline_pid)
        if user_key:
            try:
                baseline = await torn_client.fetch_personalstats(user_key["api_key"])
                baseline_name = user_key["player_name"]
            except Exception:
                pass

    enemy_list = []
    for m in members:
        ps = spy_data.get(m.id)
        # Prefer spy estimate for stat-based threat if available
        if m.id in spy_estimates and baseline_pid:
            own_est = spy_mod.spy_service.repo.get_estimate(baseline_pid) if spy_mod.spy_service else None
            if own_est:
                score, label = compute_stat_threat(spy_estimates[m.id], own_est)
            else:
                score, label = compute_threat(ps, m.level, baseline=baseline)
        else:
            score, label = compute_threat(ps, m.level, baseline=baseline)
        enemy_list.append({
            **m.model_dump(),
            "personal_stats": ps.model_dump() if ps else None,
            "threat_score": score, "threat_label": label,
            "spy_total": spy_estimates[m.id]["total"] if m.id in spy_estimates else None,
            "attack_url": f"https://www.torn.com/loader.php?sid=attack&user2ID={m.id}",
            "profile_url": f"https://www.torn.com/profiles.php?XID={m.id}",
            "stats_url": f"https://www.torn.com/personalstats.php?ID={m.id}",
        })

    enemy_list.sort(key=lambda e: (
        0 if (e["last_action"]["status"] != "Offline" and e["status"]["state"] == "Okay") else 1,
        e["threat_score"]
    ))

    return {
        "faction": info.model_dump(), "members": enemy_list,
        "threat_mode": "relative" if baseline else "absolute",
        "threat_baseline": baseline_name if baseline else None,
        "cached_at": int(time.time()),
    }


@app.get("/api/training/stats")
async def training_stats(x_player_id: int = Header()):
    user_key = key_store.get_key(x_player_id)
    if not user_key:
        raise HTTPException(status_code=401, detail="Register your API key first")
    try:
        data = await torn_client.fetch_training_data(user_key["api_key"])
        if data is None:
            raise HTTPException(status_code=502, detail="Failed to fetch training data from Torn API")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Training stats fetch failed for pid=%d: %s", x_player_id, e)
        raise HTTPException(status_code=502, detail=f"Torn API error: {e}")


class KeyRegister(BaseModel):
    api_key: str


@app.post("/api/keys")
async def register_key(body: KeyRegister):
    try:
        resp = await torn_client._http.get(
            "https://api.torn.com/user/",
            params={"selections": "profile", "key": body.api_key},
        )
        resp.raise_for_status()
        raw = resp.json()
        if inspect.isawaitable(raw):
            raw = await raw
    except Exception as e:
        logger.error("Key registration failed — Torn API error: %s", e)
        raise HTTPException(status_code=502, detail=f"Failed to validate key with Torn API: {e}")
    if "error" in raw:
        logger.warning("Key registration rejected — Torn API: %s", raw["error"]["error"])
        raise HTTPException(status_code=400, detail=raw["error"]["error"])
    faction = raw.get("faction", {})
    if faction.get("faction_id") != FACTION_ID:
        logger.warning("Key registration rejected — wrong faction: %s (%s)", raw.get("name"), faction.get("faction_name"))
        raise HTTPException(status_code=403, detail="You must be a member of The Masters to use this tool")
    key_store.save_key(player_id=raw["player_id"], player_name=raw["name"], api_key=body.api_key)
    role = get_role(raw["player_id"])
    token = create_jwt(raw["player_id"], raw["name"], JWT_SECRET)
    logger.info("Key registered: %s [%d] role=%s", raw["name"], raw["player_id"], role)

    # Test key access level — check if stocks/battlestats work
    access_level = "full"
    limited_features: list[str] = []
    try:
        test_resp = await torn_client._http.get(
            "https://api.torn.com/user/",
            params={"selections": "stocks", "key": body.api_key},
        )
        test_raw = test_resp.json()
        if inspect.isawaitable(test_raw):
            test_raw = await test_raw
        if "error" in test_raw:
            access_level = "limited"
            limited_features.append("stocks")
    except Exception:
        pass

    return {
        "status": "ok", "player_id": raw["player_id"], "name": raw["name"], "role": role,
        "access_level": access_level, "limited_features": limited_features, "token": token,
    }


@app.get("/api/announcements")
async def get_announcements(_=Depends(verify_member)):
    return {"announcements": key_store.get_active_announcements()}

@app.get("/api/announcements/all")
async def get_all_announcements(_=Depends(verify_member)):
    return {"announcements": key_store.get_all_announcements()}

@app.post("/api/heartbeat")
async def heartbeat(x_player_id: int = Header()):
    if presence_repo:
        presence_repo.heartbeat(x_player_id)
    return {"ok": True}


@app.get("/api/members/avatars")
async def members_avatars(_=Depends(verify_member)):
    return {"avatars": key_store._keys.get_avatar_map()}


@app.get("/api/profile/me")
async def profile_me(x_player_id: int = Header()):
    user_key = key_store.get_key(x_player_id)
    if not user_key:
        raise HTTPException(status_code=404, detail="Key not found")
    resp = await torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "profile,bars", "key": user_key["api_key"]},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw:
        raise HTTPException(status_code=502, detail="Torn API error")
    return {
        "player_id": raw.get("player_id"),
        "name": raw.get("name"),
        "level": raw.get("level"),
        "faction": raw.get("faction"),
        "profile_image": raw.get("profile_image"),
        "life": raw.get("life"),
        "last_action": raw.get("last_action"),
        "status": raw.get("status"),
    }


@app.get("/api/keys")
async def list_keys(_=Depends(verify_member)):
    keys = key_store.get_all_keys()
    return {"keys": [{"player_id": k["player_id"], "name": k["player_name"]} for k in keys]}


@app.delete("/api/keys/{player_id}")
async def delete_key(player_id: int, admin: dict = Depends(admin_mod.require_admin)):
    if player_id == admin["sub"]:
        raise HTTPException(status_code=403, detail="Cannot delete your own key via admin panel")
    key_store.delete_key(player_id=player_id)
    return {"status": "ok", "deleted_player_id": player_id, "deleted_by": admin["sub"]}


static_dir = os.path.join(os.path.dirname(__file__), "..", "static")


def _resolve_static_path(static_root: str, *parts: str) -> str | None:
    candidate = os.path.realpath(os.path.join(static_root, *parts))
    try:
        if os.path.commonpath([static_root, candidate]) != static_root:
            return None
    except ValueError:
        return None
    return candidate

# Mount _next/static for efficient Next.js asset serving
_next_static = os.path.join(static_dir, "_next", "static")
if os.path.isdir(_next_static):
    app.mount("/_next/static", StaticFiles(directory=_next_static), name="next-static")


@app.head("/{path:path}")
@app.get("/{path:path}")
async def serve_frontend(path: str):
    """Serve Next.js static export with SPA fallback."""
    if not os.path.isdir(static_dir):
        raise HTTPException(status_code=404, detail="Frontend not built")

    static_root = os.path.realpath(static_dir)
    requested = _resolve_static_path(static_root, path)
    if path and requested is None:
        raise HTTPException(status_code=404, detail="Not found")

    candidates = [
        requested,
        _resolve_static_path(static_root, f"{path}.html"),
        _resolve_static_path(static_root, path, "index.html"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return FileResponse(candidate)

    fallback = _resolve_static_path(static_root, "index.html")
    if fallback and os.path.isfile(fallback):
        return FileResponse(fallback)
    raise HTTPException(status_code=404, detail="Not found")
