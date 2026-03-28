from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from api.services.spy import SpyService

router = APIRouter(prefix="/api/spy", tags=["spy"])
spy_service: SpyService | None = None
torn_client = None  # Set by main.py
tornstats_key: str = ""  # Set by main.py


def _require_service() -> SpyService:
    if spy_service is None:
        raise HTTPException(status_code=503, detail="Spy service not initialized")
    return spy_service


class SpySubmitBody(BaseModel):
    player_id: int
    strength: float
    defense: float
    speed: float
    dexterity: float


@router.get("/search")
async def search_by_name(q: str, svc: SpyService = Depends(_require_service)):
    """Search local spy estimates by player name (case-insensitive partial match)."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query required")

    # Search local spy_estimates by name
    all_estimates = svc.repo.get_all_estimates()
    query_lower = q.strip().lower()
    matches = [e for e in all_estimates if e.get("player_name") and query_lower in e["player_name"].lower()]

    if not matches:
        raise HTTPException(status_code=404, detail=f"No known players matching '{q.strip()}'")

    now = datetime.now(timezone.utc)
    results = []
    for est in matches[:20]:
        reported = datetime.fromisoformat(est["reported_at"])
        if reported.tzinfo is None:
            reported = reported.replace(tzinfo=timezone.utc)
        results.append({
            "player_id": est["player_id"], "player_name": est["player_name"],
            "strength": est["strength"], "defense": est["defense"],
            "speed": est["speed"], "dexterity": est["dexterity"],
            "total": est["total"], "confidence": est["confidence"],
            "source": est["source"], "reported_at": est["reported_at"],
            "age_days": (now - reported).days,
        })

    # If single match, return it directly; if multiple, return first (best total)
    results.sort(key=lambda r: r["total"], reverse=True)
    return results[0]


@router.get("/known")
async def list_known_estimates(svc: SpyService = Depends(_require_service)):
    """Return all players with known stat estimates."""
    estimates = svc.repo.get_all_estimates()
    now = datetime.now(timezone.utc)
    result = []
    for est in estimates:
        reported = datetime.fromisoformat(est["reported_at"])
        if reported.tzinfo is None:
            reported = reported.replace(tzinfo=timezone.utc)
        result.append({
            "player_id": est["player_id"], "player_name": est["player_name"],
            "strength": est["strength"], "defense": est["defense"],
            "speed": est["speed"], "dexterity": est["dexterity"],
            "total": est["total"], "confidence": est["confidence"],
            "source": est["source"], "reported_at": est["reported_at"],
            "age_days": (now - reported).days,
        })
    return {"estimates": result, "count": len(result)}


@router.get("/faction/{faction_id}")
async def spy_faction(faction_id: int, svc: SpyService = Depends(_require_service)):
    """Fetch spy estimates for all members of a faction. Queries TornStats for unknowns."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Torn client not initialized")

    # Get faction member list from Torn API
    members = await torn_client.fetch_enemy_members(faction_id)
    faction_info = await torn_client.fetch_faction_info(faction_id)

    now = datetime.now(timezone.utc)
    results = []
    lookups_done = 0

    for m in members:
        est = svc.repo.get_estimate(m.id)

        # If no local data and TornStats key available, try live lookup (max 20 to avoid rate limits)
        if not est and tornstats_key and lookups_done < 20:
            ts_data = await torn_client.fetch_tornstats_spy_user(m.id, tornstats_key)
            if ts_data and ts_data.get("total", 0) > 0:
                ts_now = now.isoformat()
                svc.repo.upsert_report(
                    player_id=m.id, player_name=ts_data.get("player_name") or m.name,
                    source="tornstats", strength=ts_data["strength"], defense=ts_data["defense"],
                    speed=ts_data["speed"], dexterity=ts_data["dexterity"], total=ts_data["total"],
                    confidence="estimate", reported_at=ts_now,
                )
                svc.refresh_estimate(m.id)
                est = svc.repo.get_estimate(m.id)
            lookups_done += 1

        if est:
            reported = datetime.fromisoformat(est["reported_at"])
            if reported.tzinfo is None:
                reported = reported.replace(tzinfo=timezone.utc)
            results.append({
                "player_id": est["player_id"], "player_name": est["player_name"] or m.name,
                "strength": est["strength"], "defense": est["defense"],
                "speed": est["speed"], "dexterity": est["dexterity"],
                "total": est["total"], "confidence": est["confidence"],
                "source": est["source"], "reported_at": est["reported_at"],
                "age_days": (now - reported).days,
                "level": m.level,
            })
        else:
            results.append({
                "player_id": m.id, "player_name": m.name,
                "strength": 0, "defense": 0, "speed": 0, "dexterity": 0,
                "total": 0, "confidence": "unknown",
                "source": "none", "reported_at": None, "age_days": None,
                "level": m.level,
            })

    results.sort(key=lambda r: r["total"], reverse=True)

    return {
        "faction": faction_info.model_dump() if faction_info else None,
        "members": results,
        "known_count": sum(1 for r in results if r["confidence"] != "unknown"),
        "total_count": len(results),
    }


@router.get("/{player_id}")
async def get_spy_estimate(player_id: int, svc: SpyService = Depends(_require_service)):
    est = svc.repo.get_estimate(player_id)

    # If no local data, try TornStats live lookup
    if not est and torn_client and tornstats_key:
        ts_data = await torn_client.fetch_tornstats_spy_user(player_id, tornstats_key)
        if ts_data and ts_data.get("total", 0) > 0:
            now = datetime.now(timezone.utc).isoformat()
            svc.repo.upsert_report(
                player_id=player_id, player_name=ts_data.get("player_name"),
                source="tornstats", strength=ts_data["strength"], defense=ts_data["defense"],
                speed=ts_data["speed"], dexterity=ts_data["dexterity"], total=ts_data["total"],
                confidence="estimate", reported_at=now,
            )
            svc.refresh_estimate(player_id)
            est = svc.repo.get_estimate(player_id)

    if not est:
        raise HTTPException(status_code=404, detail="No spy data available for this player")
    reported = datetime.fromisoformat(est["reported_at"])
    if reported.tzinfo is None:
        reported = reported.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - reported).days
    return {
        "player_id": est["player_id"], "player_name": est["player_name"],
        "strength": est["strength"], "defense": est["defense"],
        "speed": est["speed"], "dexterity": est["dexterity"],
        "total": est["total"], "confidence": est["confidence"],
        "source": est["source"], "reported_at": est["reported_at"], "age_days": age_days,
    }


@router.post("/submit")
async def submit_spy(body: SpySubmitBody, x_player_id: int = Header(), svc: SpyService = Depends(_require_service)):
    total = body.strength + body.defense + body.speed + body.dexterity
    now = datetime.now(timezone.utc).isoformat()
    svc.repo.upsert_report(
        player_id=body.player_id, player_name=None, source="member_submit",
        strength=body.strength, defense=body.defense, speed=body.speed,
        dexterity=body.dexterity, total=total, confidence="exact", reported_at=now,
    )
    svc.refresh_estimate(body.player_id)
    return {"status": "ok", "player_id": body.player_id}
