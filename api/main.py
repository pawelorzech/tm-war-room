from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("tm-hub")

from api.analytics import AnalyticsStore
from api.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY, SUPERADMIN_ID, SUPERADMIN_IDS, JWT_SECRET
from api.torn_client import TornClient
from api.auth import create_jwt, rate_limiter, require_bearer_token, TOKEN_TYPE_SESSION, TOKEN_TYPE_ADMIN
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
from api.routers.company_director import router as company_director_router
import api.routers.company_director as company_director_mod
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
revoked_jwt_repo = None  # F-16: RevokedJwtRepository, set in lifespan

# Background bars cache: {player_id: {energy, max_energy, drug_cd}} — refreshed by scheduler
_bars_cache: dict[int, dict] = {}
_bars_cache_ts: float = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global torn_client, key_store, analytics_store, presence_repo
    os.makedirs("data", exist_ok=True)
    analytics_store = AnalyticsStore(db_path="data/analytics.db")
    analytics_store.cleanup(days=30)
    torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL, analytics_store=analytics_store)
    key_store = KeyStore(db_path="data/keys.db", encryption_key=ENCRYPTION_KEY)
    admin_mod.init(key_store, analytics_store, torn_client, time.time())
    # F-16: wire up JWT revocation list.
    from api.db.repos.revoked_jwts import RevokedJwtRepository
    from api.auth import set_revocation_check
    global revoked_jwt_repo  # noqa: PLW0603
    revoked_jwt_repo = RevokedJwtRepository(db_path="data/keys.db")
    set_revocation_check(revoked_jwt_repo.is_revoked)
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
    from api.db.repos.companies import CompanySnapshotRepository
    from api.db.repos.tracked_companies import TrackedCompaniesRepository
    from api.db.repos.pinned_weeks import PinnedWeeksRepository
    from api.db.repos.company_alerts import CompanyAlertConfigRepository
    companies_repo = CompanySnapshotRepository(db_path="data/keys.db")
    tracked_companies_repo = TrackedCompaniesRepository(db_path="data/keys.db")
    pinned_weeks_repo = PinnedWeeksRepository(db_path="data/keys.db")
    company_alerts_repo = CompanyAlertConfigRepository(db_path="data/keys.db")
    company_director_mod.torn_client = torn_client
    company_director_mod.key_store = key_store
    company_director_mod.tornstats_key = TORNSTATS_API_KEY
    company_director_mod.companies_repo = companies_repo
    company_director_mod.tracked_companies_repo = tracked_companies_repo
    company_director_mod.pinned_weeks_repo = pinned_weeks_repo
    company_director_mod.company_alerts_repo = company_alerts_repo

    from api.db.repos.push_repository import PushRepository
    push_repo = PushRepository(db_path="data/keys.db")
    push_mod.push_repo = push_repo
    push_mod.key_store = key_store
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
        "companies_repo": companies_repo,
        "tracked_companies_repo": tracked_companies_repo,
        "pinned_weeks_repo": pinned_weeks_repo,
        "company_alerts_repo": company_alerts_repo,
    })
    from api import b2_client
    if b2_client.is_configured():
        async def _startup_avatar_refresh():
            from api.scheduler.jobs.refresh_avatars import run_refresh_avatars
            try:
                await run_refresh_avatars()
            except Exception as e:
                logger.warning("Startup avatar refresh failed: %s", e)
        asyncio.create_task(_startup_avatar_refresh())

    logger.info("TM Hub started — superadmin=%d, faction=%d, scheduler active", SUPERADMIN_ID, FACTION_ID)
    async with _mcp_app.lifespan(_mcp_app):
        yield
    await chat_mgr.close_all()
    await app_scheduler.__aexit__(None, None, None)
    await torn_client.close()
    logger.info("TM Hub shutting down")


app = FastAPI(title="TM Hub", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=500)
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
app.include_router(company_director_router)
app.include_router(push_router)
app.include_router(version_router)
app.include_router(chat_router)
app.include_router(armoury_router)

# MCP server (Streamable HTTP transport)
_mcp_app = mcp_server.http_app(path="/", stateless_http=True, middleware=get_mcp_middleware())
app.mount("/mcp", _mcp_app)

PUBLIC_API_PATHS = {
    "/api/keys",
    "/api/settings/public",
    "/api/logout",
}

@app.get("/api/settings/public")
async def public_settings():
    from api.db.repos.settings import AppSettingsRepository
    repo = AppSettingsRepository(db_path="data/keys.db")
    return repo.get_public()


@app.post("/api/admin/refresh-avatars")
async def admin_refresh_avatars(admin: dict = Depends(admin_mod.require_superadmin)):
    """Manually trigger avatar refresh (superadmin only) with diagnostics."""
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
        logger.exception("Avatar refresh failed for superadmin %d", admin["sub"])
        raise HTTPException(status_code=500, detail="Avatar refresh failed") from e


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


@app.get("/api/dashboard")
async def dashboard_aggregate(x_player_id: int = Header()):
    """Single aggregated endpoint for the dashboard page — replaces 7+ parallel calls."""
    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")

    from api.scheduler.jobs.refresh_data import war_active, last_full_refresh, _cycle

    active_key = _get_active_api_key()

    # All these hit in-memory caches (refreshed by scheduler), so they're fast
    overview_task = torn_client.fetch_members(api_key=active_key)
    chain_task = torn_client.fetch_chain(api_key=active_key)
    war_task = torn_client.fetch_war(api_key=active_key)
    bounties_task = torn_client.fetch_bounties()
    oc_task = torn_client.fetch_faction_crimes(cat="planning")

    results = await asyncio.gather(
        overview_task, chain_task, war_task, bounties_task, oc_task,
        return_exceptions=True,
    )
    members = results[0] if not isinstance(results[0], BaseException) else []
    chain = results[1] if not isinstance(results[1], BaseException) else None
    war = results[2] if not isinstance(results[2], BaseException) else None
    bounties = results[3] if not isinstance(results[3], BaseException) else []
    oc_crimes = results[4] if not isinstance(results[4], BaseException) else []

    # Pre-computed counts — iterate Pydantic models directly (no model_dump overhead)
    _online_count = 0
    _hospital_count = 0
    _traveling_count = 0
    _wall_count = 0
    for m in members:
        status_lower = (m.status.description or m.status.state or "").lower()
        if "hospital" in status_lower:
            _hospital_count += 1
        elif "travel" in status_lower or "abroad" in status_lower:
            _traveling_count += 1
        if m.is_on_wall:
            _wall_count += 1
        la_lower = (m.last_action.relative or "").lower()
        if "online" in la_lower or la_lower.startswith(("0 ", "1 ", "2 ", "3 ", "4 ", "5 ")):
            _online_count += 1

    # Loot data (from cache, refreshed by scheduler/endpoint)
    loot_data = None
    try:
        from api.routers import loot as loot_mod
        if loot_mod._cache:
            loot_data = loot_mod._cache
    except Exception:
        pass

    # Chain summary
    chain_summary = {"total_chains": 0, "attacks_in_db": 0}
    try:
        from api.routers import chain as chain_mod_ref
        if chain_mod_ref.attack_repo:
            chain_summary["attacks_in_db"] = chain_mod_ref.attack_repo.get_count()
    except Exception:
        pass

    # Chat unread
    chat_unread = {"channels": {}, "total": 0}
    chat_channels = []
    try:
        from api.routers import chat as chat_mod_ref
        if chat_mod_ref.chat_repo:
            channels = chat_mod_ref.chat_repo.get_channels()
            chat_channels = [{"id": c["id"], "name": c["name"]} for c in channels]
            unread = chat_mod_ref.chat_repo.get_unread_counts(x_player_id)
            total = sum(unread.values())
            chat_unread = {"channels": unread, "total": total}
    except Exception:
        pass

    return {
        "member_counts": {
            "total": len(members),
            "online": _online_count,
            "hospital": _hospital_count,
            "traveling": _traveling_count,
            "on_wall": _wall_count,
        },
        "war": war.model_dump() if war else None,
        "war_progress": _build_war_progress(war),
        "chain": chain,
        "chain_summary": chain_summary,
        "loot": loot_data,
        "bounties": bounties,
        "oc_crimes": oc_crimes,
        "chat_unread": chat_unread,
        "chat_channels": chat_channels,
        "status": {
            "war_active": war_active,
            "poll_interval": 15 if war_active else 60,
            "last_refresh": int(last_full_refresh),
            "refresh_cycle": _cycle,
        },
        "cached_at": int(time.time()),
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


SESSION_COOKIE_NAME = "tm_session"
ADMIN_COOKIE_NAME = "tm_admin"
COOKIE_MAX_AGE = 86400  # 24h, matches JWT expiry


def _is_secure_cookie() -> bool:
    """Cookies must be Secure in prod; in dev (HTTP localhost) Secure would block them."""
    from api.config import APP_VERSION
    return APP_VERSION != "dev"


def _set_session_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME, value=token, max_age=COOKIE_MAX_AGE,
        httponly=True, secure=_is_secure_cookie(), samesite="strict", path="/",
    )


def _set_admin_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key=ADMIN_COOKIE_NAME, value=token, max_age=COOKIE_MAX_AGE,
        httponly=True, secure=_is_secure_cookie(), samesite="strict", path="/",
    )


def _clear_auth_cookies(response: JSONResponse) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(ADMIN_COOKIE_NAME, path="/")


def _bearer_or_cookie(request: Request, cookie_name: str) -> str:
    """Return 'Bearer <token>' string from Authorization header OR named cookie."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth
    cookie_token = request.cookies.get(cookie_name)
    if cookie_token:
        return f"Bearer {cookie_token}"
    return ""


@app.middleware("http")
async def enforce_api_auth(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in PUBLIC_API_PATHS and not path.startswith("/api/admin/"):
        try:
            payload = require_bearer_token(
                _bearer_or_cookie(request, SESSION_COOKIE_NAME),
                JWT_SECRET,
                allowed_token_types=(TOKEN_TYPE_SESSION, TOKEN_TYPE_ADMIN),
            )
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

        player_id_raw = request.headers.get("x-player-id")
        if player_id_raw is None:
            return JSONResponse({"detail": "Missing X-Player-Id header"}, status_code=400)
        if not player_id_raw.isdigit():
            return JSONResponse({"detail": "Invalid X-Player-Id header"}, status_code=400)
        if int(player_id_raw) != payload["sub"]:
            return JSONResponse({"detail": "Token subject does not match X-Player-Id"}, status_code=403)

        request.state.auth = payload

    response = await call_next(request)
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        # F-07: dropped 'unsafe-inline' from script-src — Next.js static export emits only external <script src=...>
        "script-src 'self' https://analityka.tri.ovh; "
        # style-src keeps 'unsafe-inline' for Tailwind utilities + React inline style attributes
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https://www.torn.com https://*.backblazeb2.com; "
        "connect-src 'self' wss://hub.tri.ovh https://analityka.tri.ovh; "
        "font-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "object-src 'none'",
    )
    response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    if path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", _api_cache_header(path))
    return response


# Cache-Control per API path: cacheable read-only endpoints get stale-while-revalidate
_API_CACHE_RULES: list[tuple[str, str]] = [
    ("/api/company/catalog", "private, max-age=300, stale-while-revalidate=600"),
    ("/api/company/director/me", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/company/director/news", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/company/director/faction", "private, max-age=300, stale-while-revalidate=600"),
    ("/api/company/director/trends", "private, max-age=300, stale-while-revalidate=600"),
    ("/api/company/director/stock-runway", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/company/director/applications/ranked", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/company/director/weekly-comparison", "private, max-age=60, stale-while-revalidate=180"),
    ("/api/company/director/pinned-weeks", "private, max-age=30, stale-while-revalidate=60"),
    ("/api/company/director/alerts", "private, max-age=30, stale-while-revalidate=60"),
    ("/api/stocks/market", "private, max-age=120, stale-while-revalidate=300"),
    ("/api/awards/me", "private, max-age=60, stale-while-revalidate=300"),
    ("/api/overview", "private, max-age=15, stale-while-revalidate=30"),
    ("/api/dashboard", "private, max-age=15, stale-while-revalidate=30"),
    ("/api/status", "private, max-age=10, stale-while-revalidate=20"),
    ("/api/bounties", "private, max-age=30, stale-while-revalidate=60"),
    ("/api/loot", "private, max-age=15, stale-while-revalidate=30"),
    ("/api/market/prices", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/travel", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/chain/", "private, max-age=30, stale-while-revalidate=60"),
    ("/api/stats/", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/spy/", "private, max-age=30, stale-while-revalidate=60"),
    ("/api/armoury/", "private, max-age=30, stale-while-revalidate=60"),
    ("/api/members/", "private, max-age=15, stale-while-revalidate=30"),
    ("/api/oc", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/wars", "private, max-age=60, stale-while-revalidate=120"),
    ("/api/revives", "private, max-age=30, stale-while-revalidate=60"),
    ("/api/notifications", "private, max-age=15, stale-while-revalidate=30"),
    ("/api/training/", "private, max-age=60, stale-while-revalidate=120"),
]


def _api_cache_header(path: str) -> str:
    for prefix, header in _API_CACHE_RULES:
        if path.startswith(prefix):
            return header
    return "no-store"


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
    if player_id in SUPERADMIN_IDS:
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
    members, war, chain = await asyncio.gather(
        torn_client.fetch_members(api_key=active_key),
        torn_client.fetch_war(api_key=active_key),
        torn_client.fetch_chain(api_key=active_key),
    )
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
    if yata_data is None:
        all_keys = key_store.get_all_keys()
        fallback_key = next((k["api_key"] for k in all_keys if k["api_key"] != active_key), None)
        if fallback_key:
            yata_data = await torn_client.fetch_yata_members(api_key=fallback_key)
    yata_down = yata_data is None

    # Read from background bars cache (populated by scheduler every 30s)
    result = {}
    for pid in visible_ids:
        pid_str = str(pid)
        cached_bars = _bars_cache.get(pid)
        if cached_bars:
            result[pid_str] = {
                "energy": cached_bars["energy"],
                "max_energy": cached_bars["max_energy"],
                "drug_cd": cached_bars["drug_cd"],
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
async def enemy(
    faction_id: int | None = Query(default=None),
    baseline_pid: int | None = Query(default=None),
    x_player_id: int = Header(),
):
    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if baseline_pid is not None and baseline_pid != x_player_id:
        raise HTTPException(status_code=403, detail="baseline_pid must match the authenticated player")
    enemy_id = faction_id
    if not enemy_id:
        war = await torn_client.fetch_war()
        if war and war.factions:
            enemy_faction = next((f for f in war.factions if f.id != FACTION_ID), None)
            if enemy_faction:
                enemy_id = enemy_faction.id
    if not enemy_id:
        return {"faction": None, "members": [], "cached_at": int(time.time())}

    # Build parallel tasks for all independent fetches
    tasks = {
        "members": torn_client.fetch_enemy_members(enemy_id),
        "info": torn_client.fetch_faction_info(enemy_id),
    }
    if TORNSTATS_API_KEY:
        tasks["spy"] = torn_client.fetch_tornstats_spy(enemy_id, TORNSTATS_API_KEY)

    baseline_name = None
    user_key = None
    if baseline_pid:
        user_key = key_store.get_key(baseline_pid)
        if user_key:
            tasks["baseline"] = torn_client.fetch_personalstats(user_key["api_key"])
            baseline_name = user_key["player_name"]

    # Run all fetches in parallel
    task_keys = list(tasks.keys())
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    result_map = dict(zip(task_keys, results))

    # Extract results, handling failures gracefully
    members = result_map["members"]
    if isinstance(members, BaseException):
        logger.error("Failed to fetch enemy members for faction %d: %s", enemy_id, members)
        return {"faction": None, "members": [], "cached_at": int(time.time())}

    info = result_map["info"]
    if isinstance(info, BaseException):
        logger.error("Failed to fetch faction info for %d: %s", enemy_id, info)
        info = None

    spy_data = {}
    if "spy" in result_map:
        spy_result = result_map["spy"]
        if not isinstance(spy_result, BaseException):
            spy_data = spy_result

    baseline = None
    if "baseline" in result_map:
        baseline_result = result_map["baseline"]
        if isinstance(baseline_result, BaseException):
            baseline_name = None
        else:
            baseline = baseline_result

    # Look up spy estimates for better threat scoring
    spy_estimates = {}
    if spy_mod.spy_service:
        for m in members:
            est = spy_mod.spy_service.repo.get_estimate(m.id)
            if est:
                spy_estimates[m.id] = est

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
        "faction": info.model_dump() if info else None, "members": enemy_list,
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
        raise HTTPException(status_code=502, detail="Torn API temporarily unavailable")


class KeyRegister(BaseModel):
    api_key: str


@app.post("/api/keys")
async def register_key(body: KeyRegister, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.check(f"register:{client_ip}", max_requests=10):
        raise HTTPException(status_code=429, detail="Too many registration attempts, try again later")
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
        raise HTTPException(status_code=502, detail="Failed to validate key — Torn API temporarily unavailable")
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

    body_payload = {
        "status": "ok", "player_id": raw["player_id"], "name": raw["name"], "role": role,
        "access_level": access_level, "limited_features": limited_features, "token": token,
    }
    response = JSONResponse(content=body_payload)
    _set_session_cookie(response, token)
    return response


@app.post("/api/logout")
async def logout(request: Request):
    """Clear session/admin cookies + revoke their jti (F-16) so they can't be reused."""
    from api.auth import decode_jwt as _decode_jwt
    response = JSONResponse(content={"status": "ok"})
    _clear_auth_cookies(response)
    if revoked_jwt_repo is not None:
        # Revoke any token presented in cookies or Authorization header.
        candidates = []
        for cookie_name in (SESSION_COOKIE_NAME, ADMIN_COOKIE_NAME):
            tok = request.cookies.get(cookie_name)
            if tok:
                candidates.append(tok)
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            candidates.append(auth[7:])
        for raw in candidates:
            payload = _decode_jwt(raw, JWT_SECRET)
            if payload and payload.get("jti") and payload.get("exp"):
                try:
                    revoked_jwt_repo.revoke(payload["jti"], int(payload["exp"]), payload.get("sub"))
                except Exception as exc:
                    logger.warning("Failed to revoke jti=%s: %s", payload.get("jti"), exc)
    return response


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
            return FileResponse(candidate, headers=_static_cache_headers(candidate))

    fallback = _resolve_static_path(static_root, "index.html")
    if fallback and os.path.isfile(fallback):
        return FileResponse(fallback, headers={"Cache-Control": "public, max-age=0, must-revalidate"})
    raise HTTPException(status_code=404, detail="Not found")


def _static_cache_headers(file_path: str) -> dict[str, str]:
    """Cache headers: immutable for hashed Next.js assets, revalidate for HTML."""
    if "/_next/" in file_path:
        return {"Cache-Control": "public, max-age=31536000, immutable"}
    if file_path.endswith(".html"):
        return {"Cache-Control": "public, max-age=0, must-revalidate"}
    return {"Cache-Control": "public, max-age=3600"}
