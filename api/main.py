from __future__ import annotations

import inspect
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
from api.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY, SUPERADMIN_ID
from api.torn_client import TornClient
from api.db import KeyStore
from api.threat import compute_threat, compute_stat_threat
from api.admin import router as admin_router
import api.admin as admin_mod
from api.routers.spy import router as spy_router
import api.routers.spy as spy_mod

torn_client: TornClient | None = None
key_store: KeyStore | None = None
analytics_store = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global torn_client, key_store, analytics_store
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

    from api.scheduler.engine import create_and_start_scheduler
    app_scheduler = await create_and_start_scheduler({
        "key_repo": key_store._keys,
        "stats_repo": stats_repo,
        "spy_service": spy_mod.spy_service,
        "torn_client": torn_client,
        "tornstats_key": TORNSTATS_API_KEY,
    })
    logger.info("TM Hub started — superadmin=%d, faction=%d, scheduler active", SUPERADMIN_ID, FACTION_ID)
    yield
    await app_scheduler.__aexit__(None, None, None)
    await torn_client.close()
    logger.info("TM Hub shutting down")


app = FastAPI(title="TM Hub", lifespan=lifespan)
app.include_router(admin_router)
app.include_router(spy_router)

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
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
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
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
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
    if active_key != torn_client._api_key:
        torn_client._api_key = active_key
    members = await torn_client.fetch_members()
    war = await torn_client.fetch_war()
    chain = await torn_client.fetch_chain()
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
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")

    active_key = _get_active_api_key()
    if active_key != torn_client._api_key:
        torn_client._api_key = active_key
    members = await torn_client.fetch_members()
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
    yata_data = await torn_client.fetch_yata_members()
    if yata_data is None and all_keys:
        fallback_key = next((k["api_key"] for k in all_keys if k["api_key"] != torn_client._api_key), None)
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
        all_keys = key_store.get_all_keys()
        user_key = next((k for k in all_keys if k["player_id"] == baseline_pid), None)
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
    all_keys = key_store.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
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
    logger.info("Key registered: %s [%d] role=%s", raw["name"], raw["player_id"], role)
    return {"status": "ok", "player_id": raw["player_id"], "name": raw["name"], "role": role}


@app.get("/api/announcements")
async def get_announcements(_=Depends(verify_member)):
    return {"announcements": key_store.get_active_announcements()}

@app.get("/api/announcements/all")
async def get_all_announcements(_=Depends(verify_member)):
    return {"announcements": key_store.get_all_announcements()}

@app.get("/api/keys")
async def list_keys(_=Depends(verify_member)):
    keys = key_store.get_all_keys()
    return {"keys": [{"player_id": k["player_id"], "name": k["player_name"]} for k in keys]}


@app.delete("/api/keys/{player_id}")
async def delete_key(player_id: int):
    key_store.delete_key(player_id=player_id)
    return {"status": "ok"}


static_dir = os.path.join(os.path.dirname(__file__), "..", "static")

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

    file_path = os.path.join(static_dir, path)
    # Try exact file
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # Try with .html extension (Next.js static export pattern)
    html_path = file_path + ".html"
    if os.path.isfile(html_path):
        return FileResponse(html_path)
    # Try index.html in directory
    index_path = os.path.join(file_path, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    # SPA fallback — serve root index.html
    fallback = os.path.join(static_dir, "index.html")
    if os.path.isfile(fallback):
        return FileResponse(fallback)
    raise HTTPException(status_code=404, detail="Not found")
