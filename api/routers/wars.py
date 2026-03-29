from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("tm-hub.wars")

router = APIRouter(prefix="/api/wars", tags=["wars"])
torn_client = None  # Set by main.py


@router.get("")
async def war_history():
    """Get faction war history: ranked wars, raids, territory wars."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    try:
        raw = await torn_client.fetch_war_history()
    except Exception as e:
        logger.error("Failed to fetch war history: %s", e)
        return {"ranked": None, "raids": [], "territory": []}

    logger.info("War history raw keys: %s", list(raw.keys()) if raw else "None")

    result = {
        "ranked": None,
        "raids": [],
        "territory": [],
    }

    # Current/recent ranked war
    ranked = raw.get("ranked")
    if ranked and isinstance(ranked, dict):
        factions = ranked.get("factions", {})
        faction_list = []
        for fid, fdata in factions.items():
            if isinstance(fdata, dict):
                faction_list.append({
                    "faction_id": int(fid),
                    "name": fdata.get("name", ""),
                    "score": fdata.get("score", 0),
                    "chain": fdata.get("chain", 0),
                })
        result["ranked"] = {
            "war_id": ranked.get("war_id", 0),
            "start": ranked.get("start", 0),
            "end": ranked.get("end", 0),
            "target": ranked.get("target", 0),
            "winner": ranked.get("winner", 0),
            "factions": faction_list,
        }

    # Raids — wrap in try/except for resilience
    raids = raw.get("raids", {}) or {}
    if isinstance(raids, dict):
        for rid, rdata in raids.items():
            if not isinstance(rdata, dict):
                continue
            factions = rdata.get("factions", {})
            faction_list = []
            for fid, fdata in factions.items():
                if isinstance(fdata, dict):
                    faction_list.append({
                        "faction_id": int(fid),
                        "name": fdata.get("name", ""),
                        "score": fdata.get("score", 0),
                    })
            result["raids"].append({
                "raid_id": rid,
                "start": rdata.get("start", 0),
                "end": rdata.get("end", 0),
                "winner": rdata.get("winner", 0),
                "factions": faction_list,
            })

    # Territory wars
    territory = raw.get("territory", {}) or {}
    if isinstance(territory, dict):
        for tid, tdata in territory.items():
            if not isinstance(tdata, dict):
                continue
            result["territory"].append({
                "territory_id": tid,
                "start": tdata.get("start", 0),
                "end": tdata.get("end", 0),
                "territory": tdata.get("territory", ""),
                "attacking_faction": tdata.get("attacking_faction", 0),
                "defending_faction": tdata.get("defending_faction", 0),
                "winner": tdata.get("winner", 0),
            })

    # Sort by start time descending
    result["raids"].sort(key=lambda r: r["start"], reverse=True)
    result["territory"].sort(key=lambda t: t["start"], reverse=True)

    return result
