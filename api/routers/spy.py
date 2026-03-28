from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from api.services.spy import SpyService

router = APIRouter(prefix="/api/spy", tags=["spy"])
spy_service: SpyService | None = None


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


@router.get("/{player_id}")
async def get_spy_estimate(player_id: int, svc: SpyService = Depends(_require_service)):
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
