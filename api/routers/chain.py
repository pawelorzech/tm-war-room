from __future__ import annotations
import time
import logging
from fastapi import APIRouter, HTTPException, Query
from api.db.repos.attacks import AttackRepository

logger = logging.getLogger("tm-hub.chain")

router = APIRouter(prefix="/api/chain", tags=["chain"])
attack_repo: AttackRepository | None = None  # Set by main.py
torn_client = None  # Set by main.py

_last_fetch: float = 0
FETCH_COOLDOWN = 30


def _parse_attack(a: dict) -> dict:
    attacker = a.get("attacker") or {}
    defender = a.get("defender") or {}
    def_faction = defender.get("faction") or {}
    mods = a.get("modifiers") or {}
    return {
        "id": a["id"],
        "attacker_id": attacker.get("id", 0),
        "attacker_name": attacker.get("name"),
        "defender_id": defender.get("id", 0),
        "defender_name": defender.get("name"),
        "defender_faction_id": def_faction.get("id"),
        "defender_faction_name": def_faction.get("name"),
        "result": a.get("result", "Unknown"),
        "respect_gain": a.get("respect_gain", 0),
        "chain": a.get("chain", 0),
        "is_ranked_war": a.get("is_ranked_war", False),
        "is_raid": a.get("is_raid", False),
        "started": a.get("started", 0),
        "ended": a.get("ended", 0),
        "fair_fight": mods.get("fair_fight", 1),
        "war_modifier": mods.get("war", 1),
        "chain_modifier": mods.get("chain", 1),
    }


async def _fetch_and_store_attacks() -> int:
    """Fetch attacks from Torn API with pagination. Returns count of new attacks."""
    global _last_fetch
    if not torn_client or not attack_repo:
        return 0
    now = time.time()
    if now - _last_fetch < FETCH_COOLDOWN:
        return 0
    _last_fetch = now

    total_inserted = 0
    # Paginate: fetch up to 1000 attacks (10 pages × 100)
    # Torn API v2 uses `before` parameter for pagination
    before = None
    for _ in range(10):
        try:
            params = {"key": torn_client._api_key, "selections": "attacks", "limit": 100}
            if before:
                params["before"] = before
            resp = await torn_client._http.get("https://api.torn.com/v2/faction", params=params)
            resp.raise_for_status()
            raw = resp.json()
            attacks = raw.get("attacks", [])
            if not attacks:
                break

            parsed = [_parse_attack(a) for a in attacks]
            inserted = attack_repo.bulk_upsert(parsed)
            total_inserted += inserted

            # If we got fewer new inserts than fetched, we've caught up with existing data
            if inserted < len(parsed) // 2:
                break

            # Set `before` to oldest attack timestamp for next page
            before = min(a["started"] for a in attacks)
        except Exception as e:
            logger.error("Attack fetch page failed: %s", e)
            break

    if total_inserted > 0:
        logger.info("Ingested %d new attacks total", total_inserted)
    return total_inserted


@router.get("/report")
async def chain_report(hours: int = Query(default=24, ge=1, le=720)):
    if not attack_repo:
        raise HTTPException(status_code=503, detail="Chain tracker not initialized")
    await _fetch_and_store_attacks()
    since = int(time.time()) - (hours * 3600)
    report = attack_repo.get_chain_report(since=since)
    total_hits = sum(r["hits"] for r in report)
    total_respect = sum(r["total_respect"] for r in report)
    return {
        "period_hours": hours,
        "since": since,
        "members": report,
        "total_hits": total_hits,
        "total_respect": round(total_respect, 2),
        "member_count": len(report),
        "attacks_in_db": attack_repo.get_count(),
    }


@router.get("/recent")
async def recent_attacks(limit: int = Query(default=50, ge=1, le=200)):
    if not attack_repo:
        raise HTTPException(status_code=503, detail="Chain tracker not initialized")
    await _fetch_and_store_attacks()
    attacks = attack_repo.get_recent(limit=limit)
    return {"attacks": attacks, "count": len(attacks)}


@router.get("/war/{faction_id}")
async def war_report(faction_id: int, hours: int = Query(default=48, ge=1, le=720)):
    if not attack_repo:
        raise HTTPException(status_code=503, detail="Chain tracker not initialized")
    await _fetch_and_store_attacks()
    since = int(time.time()) - (hours * 3600)
    report = attack_repo.get_war_report(faction_id, since=since)
    return {"enemy_faction_id": faction_id, "period_hours": hours, **report}
