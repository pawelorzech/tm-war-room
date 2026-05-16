from __future__ import annotations
import asyncio
import logging
import httpx
from fastapi import APIRouter, HTTPException, Request

from api.config import FACTION_ID
from api.utils.etag import etag_response

logger = logging.getLogger("tm-hub.wars")

router = APIRouter(prefix="/api/wars", tags=["wars"])
torn_client = None  # Set by main.py

_EMPTY_WAR = {"war_id": None, "opponent_faction_id": None, "start": None, "end": None}


@router.get("/current")
async def current_war(request: Request):
    """Lightweight current-war lookup used by the TM Hub Companion extension.

    Content scripts on torn.com profile/attack pages need ``war_id`` to fetch
    off-limits flags. They poll this endpoint instead of the full /api/overview
    payload. Returns ``{"war_id": null}`` outside of war OR when Torn upstream
    is flaking — the extension polls again next cycle.

    Sprint 2: ETag-aware so the Companion's 30s poll loop gets 304 No Content
    on the (very frequent) case where the war state hasn't changed.
    """
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    try:
        war = await torn_client.fetch_war()
    except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as exc:
        logger.warning("Torn upstream failed for /api/wars/current: %s", exc)
        return etag_response(_EMPTY_WAR, request)
    if not war or not war.war_id:
        return etag_response(_EMPTY_WAR, request)
    opponent = next((f for f in war.factions if f.id != FACTION_ID), None)
    payload = {
        "war_id": war.war_id,
        "opponent_faction_id": opponent.id if opponent else None,
        "opponent_name": opponent.name if opponent else None,
        "start": war.start,
        "end": war.end,
    }
    return etag_response(payload, request)


def _parse_factions(factions_data) -> list[dict]:
    """Parse factions from various formats."""
    result = []
    if isinstance(factions_data, dict):
        for fid, fdata in factions_data.items():
            if isinstance(fdata, dict):
                result.append({
                    "faction_id": int(fid),
                    "name": fdata.get("name", ""),
                    "score": fdata.get("score", 0),
                    "chain": fdata.get("chain", 0),
                })
    elif isinstance(factions_data, list):
        for fdata in factions_data:
            if isinstance(fdata, dict):
                result.append({
                    "faction_id": fdata.get("faction_id") or fdata.get("id", 0),
                    "name": fdata.get("name", ""),
                    "score": fdata.get("score", 0),
                    "chain": fdata.get("chain", 0),
                })
    return result


@router.get("")
async def war_history():
    """Get faction war history: ranked wars, raids, territory wars.

    The two Torn upstream calls (`fetch_war_history` for v2/faction/wars and
    `fetch_ranked_wars` for v1/torn/rankedwars) are independent — we run them
    concurrently via `asyncio.gather(return_exceptions=True)` so total latency
    is one round-trip instead of two. `return_exceptions=True` preserves the
    original per-call partial-error tolerance: one endpoint failing does not
    tank the other's data.
    """
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    raw, past_wars_raw = await asyncio.gather(
        torn_client.fetch_war_history(),
        torn_client.fetch_ranked_wars(),
        return_exceptions=True,
    )

    if isinstance(raw, Exception):
        logger.error("Failed to fetch war history: %s", raw)
        raw = None

    if not raw or not isinstance(raw, dict):
        # Still try to surface past ranked wars below — they're an independent call.
        result = {"ranked": None, "raids": [], "territory": []}
        return _attach_past_ranked(result, past_wars_raw)

    logger.info("War history keys: %s", list(raw.keys()))

    result = {"ranked": None, "raids": [], "territory": []}

    # Ranked war
    try:
        ranked = raw.get("ranked")
        if ranked and isinstance(ranked, dict):
            result["ranked"] = {
                "war_id": ranked.get("war_id", 0),
                "start": ranked.get("start", 0),
                "end": ranked.get("end", 0),
                "target": ranked.get("target", 0),
                "winner": ranked.get("winner", 0),
                "factions": _parse_factions(ranked.get("factions", {})),
            }
    except Exception as e:
        logger.error("Failed to parse ranked war: %s", e)

    # Raids
    try:
        raids = raw.get("raids") or {}
        if isinstance(raids, dict):
            for rid, rdata in raids.items():
                if not isinstance(rdata, dict):
                    continue
                result["raids"].append({
                    "raid_id": rid,
                    "start": rdata.get("start", 0),
                    "end": rdata.get("end", 0),
                    "winner": rdata.get("winner", 0),
                    "factions": _parse_factions(rdata.get("factions", {})),
                })
        elif isinstance(raids, list):
            for rdata in raids:
                if not isinstance(rdata, dict):
                    continue
                result["raids"].append({
                    "raid_id": rdata.get("id", ""),
                    "start": rdata.get("start", 0),
                    "end": rdata.get("end", 0),
                    "winner": rdata.get("winner", 0),
                    "factions": _parse_factions(rdata.get("factions", {})),
                })
    except Exception as e:
        logger.error("Failed to parse raids: %s", e)

    # Territory wars
    try:
        territory = raw.get("territory") or {}
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
        elif isinstance(territory, list):
            for tdata in territory:
                if not isinstance(tdata, dict):
                    continue
                result["territory"].append({
                    "territory_id": tdata.get("id", ""),
                    "start": tdata.get("start", 0),
                    "end": tdata.get("end", 0),
                    "territory": tdata.get("territory", ""),
                    "winner": tdata.get("winner", 0),
                })
    except Exception as e:
        logger.error("Failed to parse territory wars: %s", e)

    result["raids"].sort(key=lambda r: r.get("start", 0), reverse=True)
    result["territory"].sort(key=lambda t: t.get("start", 0), reverse=True)

    return _attach_past_ranked(result, past_wars_raw)


def _attach_past_ranked(result: dict, past_wars_raw) -> dict:
    """Parse `past_wars_raw` (from torn/rankedwars) into `result["past_ranked"]`.

    `past_wars_raw` is whatever `asyncio.gather(..., return_exceptions=True)`
    handed us — could be a list (happy path), Exception (upstream failure),
    or something unexpected. Always returns `result` with `past_ranked` set.
    """
    if isinstance(past_wars_raw, Exception):
        logger.error("Failed to fetch past ranked wars: %s", past_wars_raw)
        result["past_ranked"] = []
        return result

    try:
        logger.info(
            "Past ranked wars: type=%s, len=%s",
            type(past_wars_raw).__name__,
            len(past_wars_raw) if past_wars_raw else 0,
        )
        if past_wars_raw and len(past_wars_raw) > 0:
            first = past_wars_raw[0]
            logger.info(
                "First past war keys: %s",
                list(first.keys())[:10] if isinstance(first, dict) else "not dict",
            )
        past_wars = []
        for w in past_wars_raw or []:
            if not isinstance(w, dict):
                continue
            factions = _parse_factions(w.get("factions", {}))
            # Check if our faction was involved
            is_ours = any(f["faction_id"] == FACTION_ID for f in factions) if factions else False
            past_wars.append({
                "is_ours": is_ours,
                "war_id": w.get("war_id") or w.get("id", 0),
                "start": w.get("start", 0),
                "end": w.get("end", 0),
                "winner": w.get("winner", 0),
                "factions": factions,
            })
        past_wars.sort(key=lambda w: w.get("start", 0), reverse=True)
        result["past_ranked"] = past_wars[:20]
    except Exception as e:
        logger.error("Failed to parse past ranked wars: %s", e)
        result["past_ranked"] = []

    return result
