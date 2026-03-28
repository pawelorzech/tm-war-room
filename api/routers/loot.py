from __future__ import annotations
import logging
import time
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("tm-hub.loot")

router = APIRouter(prefix="/api/loot", tags=["loot"])
torn_client = None  # Set by main.py
tornstats_key: str = ""  # Set by main.py

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
        raw = resp.json()
    except Exception as e:
        logger.error("TornStats loot fetch failed: %s", e)
        if _cache:
            return _cache
        raise HTTPException(status_code=502, detail="Failed to fetch loot data")

    if not raw.get("status"):
        raise HTTPException(status_code=502, detail="TornStats returned error")

    loot_data = raw.get("loot", {})
    npcs = []
    for npc_id_str, npc in loot_data.items():
        npc_id = int(npc_id_str)
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

    result = {
        "npcs": npcs,
        "count": len(npcs),
        "fetched_at": int(now),
    }
    _cache = result
    _cache_ts = now
    return result
