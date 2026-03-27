from __future__ import annotations

import inspect
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Header, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY
from app.torn_client import TornClient
from app.db import KeyStore
from app.threat import compute_threat

torn_client: TornClient | None = None
key_store: KeyStore | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global torn_client, key_store
    os.makedirs("data", exist_ok=True)
    torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL)
    key_store = KeyStore(db_path="data/keys.db", encryption_key=ENCRYPTION_KEY)
    yield
    await torn_client.close()


app = FastAPI(title="TM War Room", lifespan=lifespan)


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
    # Auth check
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")

    # Get members for position lookup
    active_key = _get_active_api_key()
    if active_key != torn_client._api_key:
        torn_client._api_key = active_key
    members = await torn_client.fetch_members()
    member_map = {m.id: m for m in members}

    # Determine access level
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

    # Fetch YATA data (try faction key first, fallback to any registered key)
    yata_data = await torn_client.fetch_yata_members()
    if yata_data is None:
        already_tried = torn_client._api_key
        for entry in all_keys:
            if entry["api_key"] == already_tried:
                continue
            yata_data = await torn_client.fetch_yata_members(api_key=entry["api_key"])
            if yata_data is not None:
                break
    yata_down = yata_data is None

    # Fetch per-key data for registered members
    per_key = {}
    for entry in all_keys:
        pid = entry["player_id"]
        if pid not in visible_ids:
            continue
        try:
            bars = await torn_client.fetch_member_bars(entry["api_key"])
            per_key[pid] = bars
        except Exception:
            pass

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
        score, label = compute_threat(ps, m.level, baseline=baseline)
        enemy_list.append({
            **m.model_dump(),
            "personal_stats": ps.model_dump() if ps else None,
            "threat_score": score, "threat_label": label,
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


class KeyRegister(BaseModel):
    api_key: str


@app.post("/api/keys")
async def register_key(body: KeyRegister):
    resp = await torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "profile", "key": body.api_key},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw:
        raise HTTPException(status_code=400, detail=raw["error"]["error"])
    faction = raw.get("faction", {})
    if faction.get("faction_id") != FACTION_ID:
        raise HTTPException(status_code=403, detail="You must be a member of The Masters to use this tool")
    key_store.save_key(player_id=raw["player_id"], player_name=raw["name"], api_key=body.api_key)
    return {"status": "ok", "player_id": raw["player_id"], "name": raw["name"]}


@app.get("/api/keys")
async def list_keys(_=Depends(verify_member)):
    keys = key_store.get_all_keys()
    return {"keys": [{"player_id": k["player_id"], "name": k["player_name"]} for k in keys]}


@app.delete("/api/keys/{player_id}")
async def delete_key(player_id: int):
    key_store.delete_key(player_id=player_id)
    return {"status": "ok"}


static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/")
    async def index():
        return FileResponse(os.path.join(static_dir, "index.html"))
