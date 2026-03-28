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
