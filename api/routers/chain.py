from __future__ import annotations
import time
import logging
from fastapi import APIRouter, HTTPException, Query
from api.db.repos.attacks import AttackRepository

logger = logging.getLogger("tm-hub.chain")

router = APIRouter(prefix="/api/chain", tags=["chain"])
attack_repo: AttackRepository | None = None  # Set by main.py
torn_client = None  # Set by main.py

# Track last fetch to avoid spamming Torn API
_last_fetch: float = 0
FETCH_COOLDOWN = 30  # seconds


async def _fetch_and_store_attacks() -> int:
    """Fetch recent attacks from Torn API and store in DB. Returns count of new attacks."""
    global _last_fetch
    if not torn_client or not attack_repo:
        return 0
    now = time.time()
    if now - _last_fetch < FETCH_COOLDOWN:
        return 0
    _last_fetch = now

    try:
        resp = await torn_client._http.get(
            "https://api.torn.com/v2/faction",
            params={"key": torn_client._api_key, "selections": "attacks", "limit": 100},
        )
        resp.raise_for_status()
        raw = resp.json()
        attacks = raw.get("attacks", [])
        if not attacks:
            return 0

        parsed = []
        for a in attacks:
            attacker = a.get("attacker") or {}
            defender = a.get("defender") or {}
            def_faction = defender.get("faction") or {}
            mods = a.get("modifiers") or {}
            parsed.append({
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
            })

        inserted = attack_repo.bulk_upsert(parsed)
        if inserted > 0:
            logger.info("Ingested %d new attacks (%d total fetched)", inserted, len(parsed))
        return inserted
    except Exception as e:
        logger.error("Attack fetch failed: %s", e)
        return 0


@router.get("/report")
async def chain_report(hours: int = Query(default=24, ge=1, le=720)):
    """Get chain/attack report for the last N hours."""
    if not attack_repo:
        raise HTTPException(status_code=503, detail="Chain tracker not initialized")

    # Fetch fresh data
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
