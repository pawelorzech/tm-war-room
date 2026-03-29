from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from api.db.repos.stakeouts import StakeoutRepository

logger = logging.getLogger("tm-hub.stakeout")

router = APIRouter(prefix="/api/stakeout", tags=["stakeout"])
stakeout_repo: StakeoutRepository | None = None  # Set by main.py
key_store = None  # Set by main.py


class AddStakeoutRequest(BaseModel):
    player_id: int
    player_name: str | None = None
    notes: str = ''


@router.get("")
async def list_stakeouts(x_player_id: int = Header()):
    if not stakeout_repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")
    stakeouts = stakeout_repo.get_all()
    return {"stakeouts": stakeouts, "count": len(stakeouts)}


@router.post("")
async def add_stakeout(body: AddStakeoutRequest, x_player_id: int = Header()):
    if not stakeout_repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")
    stakeout_repo.add(body.player_id, body.player_name, x_player_id, body.notes)
    return {"status": "ok"}


@router.delete("/{player_id}")
async def remove_stakeout(player_id: int, x_player_id: int = Header()):
    if not stakeout_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    stakeout_repo.remove(player_id)
    return {"status": "ok"}
