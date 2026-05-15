from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from api.db.repos.war_off_limits import WarOffLimitsRepository

logger = logging.getLogger("tm-hub.war_off_limits")

router = APIRouter(prefix="/api/war-off-limits", tags=["war_off_limits"])

# Module-level state set by main.py lifespan
repo: WarOffLimitsRepository | None = None
key_store = None


class AddRequest(BaseModel):
    player_id: int
    player_name: str
    reason: str = ""


class UpdateRequest(BaseModel):
    reason: str = ""


def _verify_member(player_id: int) -> None:
    if not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    if not key_store.has_key(player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


def _can_mutate(row: dict, caller_id: int) -> bool:
    """True if caller owns the row or is an admin."""
    if row["set_by"] == caller_id:
        return True
    return bool(key_store and key_store.is_admin(caller_id))


@router.get("/{war_id}")
async def list_off_limits(war_id: int, x_player_id: int = Header()):
    if not repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    rows = repo.list_for_war(war_id)
    return {"war_id": war_id, "entries": rows, "count": len(rows)}


@router.post("/{war_id}")
async def add_off_limits(war_id: int, body: AddRequest, x_player_id: int = Header()):
    if not repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    if not body.player_name.strip():
        raise HTTPException(status_code=400, detail="player_name is required")
    caller = key_store.get_key(x_player_id)
    caller_name = caller["player_name"] if caller else f"#{x_player_id}"
    ok = repo.add(
        war_id=war_id,
        player_id=body.player_id,
        player_name=body.player_name,
        set_by=x_player_id,
        set_by_name=caller_name,
        reason=body.reason,
    )
    if not ok:
        raise HTTPException(
            status_code=409,
            detail="This player is already flagged for the current war.",
        )
    logger.info(
        "off-limits add war=%d player=%d by=%d reason=%r",
        war_id, body.player_id, x_player_id, (body.reason or "")[:80],
    )
    return {"status": "ok", "war_id": war_id, "player_id": body.player_id}


@router.patch("/{war_id}/{player_id}")
async def update_off_limits(
    war_id: int,
    player_id: int,
    body: UpdateRequest,
    x_player_id: int = Header(),
):
    if not repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    existing = repo.get(war_id, player_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_mutate(existing, x_player_id):
        raise HTTPException(status_code=403, detail="You can only edit your own off-limit flags")
    repo.update_reason(war_id, player_id, body.reason)
    return {"status": "ok"}


@router.delete("/{war_id}/{player_id}")
async def remove_off_limits(
    war_id: int,
    player_id: int,
    x_player_id: int = Header(),
):
    if not repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    existing = repo.get(war_id, player_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_mutate(existing, x_player_id):
        raise HTTPException(status_code=403, detail="You can only remove your own off-limit flags")
    repo.delete(war_id, player_id)
    logger.info("off-limits remove war=%d player=%d by=%d", war_id, player_id, x_player_id)
    return {"status": "ok"}
