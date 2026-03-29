from __future__ import annotations
import inspect
import logging
import time
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from api.db.repos.loot_reservations import LootReservationRepository

logger = logging.getLogger("tm-hub.loot")

router = APIRouter(prefix="/api/loot", tags=["loot"])
torn_client = None  # Set by main.py
tornstats_key: str = ""  # Set by main.py
reservation_repo: LootReservationRepository | None = None  # Set by main.py
key_store = None  # Set by main.py

_cache: dict | None = None
_cache_ts: float = 0
CACHE_TTL = 30  # seconds


@router.get("")
async def loot_timers():
    """Get current NPC loot timer data from TornStats."""
    global _cache, _cache_ts
    if not torn_client or not tornstats_key:
        raise HTTPException(status_code=503, detail="Loot tracker not initialized")

    now = time.time()
    if _cache and now - _cache_ts < CACHE_TTL:
        return _cache

    start = time.time()
    try:
        resp = await torn_client._http.get(
            f"https://www.tornstats.com/api/v2/{tornstats_key}/loot",
        )
        resp.raise_for_status()
        result = resp.json()
        raw = await result if inspect.isawaitable(result) else result
    except Exception as e:
        logger.error("TornStats loot fetch failed: %s", e)
        if _cache:
            return _cache
        raise HTTPException(status_code=502, detail="Failed to fetch loot data")

    if not raw.get("status"):
        raise HTTPException(status_code=502, detail=f"TornStats error: {raw.get('message', 'unknown')}")

    # NPC data is at top level, keyed by NPC ID (not under a "loot" key)
    npcs = []
    for key, val in raw.items():
        if key in ("status", "message", "loot") or not isinstance(val, dict):
            continue
        try:
            npc_id = int(key)
        except ValueError:
            continue
        npc = val
        hosp_out = npc.get("hosp_out", 0)
        status = npc.get("status", "Unknown")

        # Calculate current loot level based on hosp_out time
        # Level progression: hosp_out → L1, +30m → L2, +60m → L3, +120m → L4, +240m → L5
        level = 1
        level_times = {}
        if hosp_out and hosp_out > 0:
            level_times = {
                2: hosp_out + 30 * 60,
                3: hosp_out + 90 * 60,
                4: hosp_out + 210 * 60,
                5: hosp_out + 450 * 60,
            }
            # Use pre-calculated loot times from TornStats if available
            for lvl in [2, 3, 4, 5]:
                ts_key = f"loot_{lvl}"
                if npc.get(ts_key):
                    level_times[lvl] = npc[ts_key]

            for lvl in [5, 4, 3, 2]:
                if now >= level_times[lvl]:
                    level = lvl
                    break

        # Time until next level
        next_level_at = None
        if level < 5 and level_times.get(level + 1):
            nlt = level_times[level + 1]
            if nlt > now:
                next_level_at = int(nlt)

        npcs.append({
            "id": npc_id,
            "name": npc.get("name", f"NPC #{npc_id}"),
            "status": status,
            "hosp_out": hosp_out,
            "level": level,
            "next_level_at": next_level_at,
            "level_times": {str(k): v for k, v in level_times.items()},
            "updated": npc.get("updated", 0),
        })

    # Sort: highest level first, then by next level time
    npcs.sort(key=lambda n: (-n["level"], n.get("next_level_at") or float("inf")))

    # Attach reservations to each NPC
    reservations_by_npc: dict[int, list] = {}
    if reservation_repo:
        for r in reservation_repo.get_all():
            nid = r["npc_id"]
            if nid not in reservations_by_npc:
                reservations_by_npc[nid] = []
            reservations_by_npc[nid].append({
                "player_id": r["player_id"],
                "player_name": r["player_name"],
                "target_level": r["target_level"],
            })

    for npc in npcs:
        npc["reservations"] = reservations_by_npc.get(npc["id"], [])

    result = {
        "npcs": npcs,
        "count": len(npcs),
        "fetched_at": int(now),
    }
    _cache = result
    _cache_ts = now
    return result


class ReserveRequest(BaseModel):
    npc_id: int
    npc_name: str = ""
    target_level: int = 4


@router.post("/reserve")
async def reserve_npc(body: ReserveRequest, x_player_id: int = Header()):
    """Reserve a spot on an NPC loot."""
    global _cache_ts
    if not reservation_repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    all_keys = key_store.get_all_keys()
    user = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    if not user:
        raise HTTPException(status_code=401, detail="Register your API key first")
    reservation_repo.reserve(
        npc_id=body.npc_id, npc_name=body.npc_name,
        player_id=x_player_id, player_name=user["player_name"],
        target_level=body.target_level,
    )
    _cache_ts = 0  # Invalidate cache so next request shows updated reservations
    return {"status": "ok"}


@router.delete("/reserve/{npc_id}")
async def cancel_reservation(npc_id: int, x_player_id: int = Header()):
    """Cancel your reservation on an NPC."""
    global _cache_ts
    if not reservation_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    reservation_repo.cancel(npc_id, x_player_id)
    _cache_ts = 0
    return {"status": "ok"}
