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


def _verify_member(player_id: int):
    if not stakeout_repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    if not key_store.has_key(player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


@router.get("")
async def list_stakeouts(x_player_id: int = Header()):
    _verify_member(x_player_id)
    stakeouts = stakeout_repo.get_all()
    return {"stakeouts": stakeouts, "count": len(stakeouts)}


@router.post("")
async def add_stakeout(body: AddStakeoutRequest, x_player_id: int = Header()):
    _verify_member(x_player_id)
    stakeout_repo.add(body.player_id, body.player_name, x_player_id, body.notes)
    return {"status": "ok"}


@router.delete("/{player_id}")
async def remove_stakeout(player_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    stakeout_repo.remove(player_id)
    return {"status": "ok"}
