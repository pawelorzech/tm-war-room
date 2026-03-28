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

CHAIN_BONUS_HITS = {10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000}


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

            if inserted < len(parsed) // 2:
                break

            before = min(a["started"] for a in attacks)
        except Exception as e:
            logger.error("Attack fetch page failed: %s", e)
            break

    if total_inserted > 0:
        logger.info("Ingested %d new attacks total", total_inserted)
    return total_inserted


def _detect_chains(attacks: list[dict]) -> list[dict]:
    """Detect individual chains from attack data ordered by started ASC.

    Chain field: 0 = not a chain hit, 1+ = chain hit number.
    A new chain starts when chain=1 appears.
    """
    chains: list[dict] = []
    current: dict | None = None

    for attack in attacks:
        chain_num = attack.get("chain", 0)

        if chain_num == 1:
            # New chain starts
            if current:
                chains.append(current)
            current = {
                "start_ts": attack["started"],
                "end_ts": attack["ended"],
                "max_chain": 1,
                "hits": 1,
                "total_respect": attack.get("respect_gain", 0) or 0,
                "members": {attack["attacker_id"]},
                "bonus_hits": [],
                "starter_name": attack.get("attacker_name") or f"#{attack['attacker_id']}",
                "starter_id": attack["attacker_id"],
                "ender_name": attack.get("attacker_name") or f"#{attack['attacker_id']}",
                "ender_id": attack["attacker_id"],
                # Track top hitter
                "_member_respect": {attack["attacker_id"]: attack.get("respect_gain", 0) or 0},
                "_member_names": {attack["attacker_id"]: attack.get("attacker_name") or f"#{attack['attacker_id']}"},
            }
            if chain_num in CHAIN_BONUS_HITS:
                current["bonus_hits"].append({"chain": chain_num, "attacker_name": attack.get("attacker_name"), "attacker_id": attack["attacker_id"]})
        elif current and chain_num > 0:
            # Continue current chain
            current["end_ts"] = attack["ended"]
            current["max_chain"] = max(current["max_chain"], chain_num)
            current["hits"] += 1
            resp = attack.get("respect_gain", 0) or 0
            current["total_respect"] += resp
            current["members"].add(attack["attacker_id"])
            current["ender_name"] = attack.get("attacker_name") or f"#{attack['attacker_id']}"
            current["ender_id"] = attack["attacker_id"]
            # Track member respect
            aid = attack["attacker_id"]
            current["_member_respect"][aid] = current["_member_respect"].get(aid, 0) + resp
            current["_member_names"][aid] = attack.get("attacker_name") or f"#{aid}"
            if chain_num in CHAIN_BONUS_HITS:
                current["bonus_hits"].append({"chain": chain_num, "attacker_name": attack.get("attacker_name"), "attacker_id": attack["attacker_id"]})

    if current:
        chains.append(current)

    # Build summaries
    result = []
    for c in chains:
        # Find top hitter by respect
        top_id = max(c["_member_respect"], key=c["_member_respect"].get) if c["_member_respect"] else None
        duration = c["end_ts"] - c["start_ts"]
        result.append({
            "start_ts": c["start_ts"],
            "end_ts": c["end_ts"],
            "duration": duration,
            "max_chain": c["max_chain"],
            "hits": c["hits"],
            "total_respect": round(c["total_respect"], 2),
            "member_count": len(c["members"]),
            "top_hitter_name": c["_member_names"].get(top_id, "?") if top_id else "?",
            "top_hitter_id": top_id,
            "top_hitter_respect": round(c["_member_respect"].get(top_id, 0), 2) if top_id else 0,
            "starter_name": c["starter_name"],
            "starter_id": c["starter_id"],
            "ender_name": c["ender_name"],
            "ender_id": c["ender_id"],
            "bonus_hits": c["bonus_hits"],
        })

    # Return newest first
    result.reverse()
    return result


@router.get("/chains")
async def list_chains():
    """List all detected chains from attack data."""
    if not attack_repo:
        raise HTTPException(status_code=503, detail="Chain tracker not initialized")
    await _fetch_and_store_attacks()
    attacks = attack_repo.get_all_ordered()
    chains = _detect_chains(attacks)
    return {
        "chains": chains,
        "total_chains": len(chains),
        "attacks_in_db": attack_repo.get_count(),
    }


@router.get("/chains/detail")
async def chain_detail(start: int = Query(...), end: int = Query(...)):
    """Get detailed breakdown for a specific chain (by start/end timestamps)."""
    if not attack_repo:
        raise HTTPException(status_code=503, detail="Chain tracker not initialized")
    members = attack_repo.get_member_breakdown(start, end)
    attacks = attack_repo.get_attacks_in_range(start, end)
    return {
        "start_ts": start,
        "end_ts": end,
        "members": members,
        "attacks": attacks,
        "total_hits": len([a for a in attacks if a.get("chain", 0) > 0]),
        "total_respect": round(sum(a.get("respect_gain", 0) or 0 for a in attacks), 2),
    }


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
