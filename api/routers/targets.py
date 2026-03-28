from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from api.db.repos.targets import TargetRepository

logger = logging.getLogger("tm-hub.targets")

router = APIRouter(prefix="/api/targets", tags=["targets"])
target_repo: TargetRepository | None = None  # Set by main.py
key_store = None  # Set by main.py


class AddTargetRequest(BaseModel):
    player_id: int
    player_name: str | None = None
    tag: str = ''
    notes: str = ''
    difficulty: str = 'unknown'


class UpdateTargetRequest(BaseModel):
    tag: str | None = None
    notes: str | None = None
    difficulty: str | None = None


def _verify_member(player_id: int):
    if not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")


@router.get("")
async def list_targets(tag: str | None = None, x_player_id: int = Header()):
    if not target_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    targets = target_repo.get_by_tag(tag) if tag else target_repo.get_all()
    tags = target_repo.get_tags()
    return {"targets": targets, "count": len(targets), "tags": tags}


@router.post("")
async def add_target(body: AddTargetRequest, x_player_id: int = Header()):
    if not target_repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    all_keys = key_store.get_all_keys()
    adder = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    adder_name = adder["player_name"] if adder else None
    target_repo.add_target(
        player_id=body.player_id,
        player_name=body.player_name,
        added_by=x_player_id,
        added_by_name=adder_name,
        tag=body.tag,
        notes=body.notes,
        difficulty=body.difficulty,
    )
    return {"status": "ok", "player_id": body.player_id}


@router.put("/{player_id}")
async def update_target(player_id: int, body: UpdateTargetRequest, x_player_id: int = Header()):
    if not target_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    target_repo.update_target(player_id, tag=body.tag, notes=body.notes, difficulty=body.difficulty)
    return {"status": "ok"}


@router.delete("/{player_id}")
async def remove_target(player_id: int, x_player_id: int = Header()):
    if not target_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    target_repo.remove_target(player_id)
    return {"status": "ok"}
