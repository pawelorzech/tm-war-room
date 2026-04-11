from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from api.config import SUPERADMIN_ID
from api.armoury import VALID_CATEGORIES

logger = logging.getLogger("tm-hub.armoury")

router = APIRouter(prefix="/api/armoury", tags=["armoury"])
torn_client = None
key_store = None
repo = None


class CreateCompetition(BaseModel):
    name: str
    category: str
    start_ts: int
    end_ts: int


@router.get("/competitions")
async def list_competitions(x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    competitions = repo.get_all_competitions()
    return {"competitions": competitions, "count": len(competitions)}


@router.get("/competitions/{comp_id}/leaderboard")
async def get_leaderboard(comp_id: int, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    comp = repo.get_competition(comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    rows = repo.get_leaderboard(comp_id)
    leaderboard = []
    for i, r in enumerate(rows, 1):
        leaderboard.append({
            "rank": i,
            "player_id": r["player_id"],
            "player_name": r["player_name"],
            "total": r["total"],
            "deposits": r["deposits"],
            "last_deposit": r["last_deposit"],
        })
    total_deposited = sum(r["total"] for r in leaderboard)
    return {
        "competition": comp,
        "leaderboard": leaderboard,
        "total_deposited": total_deposited,
        "participants": len(leaderboard),
    }


@router.post("/competitions")
async def create_competition(body: CreateCompetition, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
    if body.end_ts <= body.start_ts:
        raise HTTPException(status_code=400, detail="end_ts must be after start_ts")
    comp_id = repo.create_competition(
        name=body.name,
        category=body.category,
        start_ts=body.start_ts,
        end_ts=body.end_ts,
        created_by=x_player_id,
    )
    return {"id": comp_id, "status": "created"}


@router.post("/competitions/{comp_id}/end")
async def end_competition(comp_id: int, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    comp = repo.get_competition(comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    repo.end_competition(comp_id)
    return {"status": "ended"}
