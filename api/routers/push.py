from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

logger = logging.getLogger("tm-hub.push")

router = APIRouter(prefix="/api/push", tags=["push"])
push_repo = None       # Set by main.py
push_service = None    # Set by main.py
vapid_public_key = None  # Set by main.py
event_repo = None      # Set by main.py — NotificationEventRepository
key_store = None       # Set by main.py — for member validation


def _verify_member(player_id: int):
    if not key_store or not key_store.has_key(player_id):
        raise HTTPException(status_code=403, detail="Not a faction member")


class PushKeys(BaseModel):
    p256dh: str = Field(..., min_length=1)
    auth: str = Field(..., min_length=1)


class SubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)
    keys: PushKeys
    preferences: dict = {}


class PreferencesRequest(BaseModel):
    preferences: dict


@router.get("/vapid-key")
async def get_vapid_key():
    return {"vapid_public_key": vapid_public_key, "enabled": vapid_public_key is not None}


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.save(
        player_id=x_player_id,
        endpoint=req.endpoint,
        p256dh=req.keys.p256dh,
        auth=req.keys.auth,
        preferences=req.preferences,
    )
    return {"status": "subscribed"}


@router.put("/preferences")
async def update_preferences(req: PreferencesRequest, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.update_preferences(x_player_id, req.preferences)
    return {"status": "updated"}


@router.delete("/unsubscribe")
async def unsubscribe(endpoint: str, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    # Verify ownership before deleting
    subs = push_repo.get_by_player(x_player_id)
    if not any(s["endpoint"] == endpoint for s in subs):
        raise HTTPException(status_code=403, detail="Not your subscription")
    push_repo.delete_by_endpoint(endpoint)
    return {"status": "unsubscribed"}


# ── PDA Channel ─────────────────────────────────────────────

@router.post("/pda/register")
async def pda_register(x_player_id: int = Header()):
    """Register PDA as notification channel for this player."""
    _verify_member(x_player_id)
    sentinel_endpoint = f"pda:{x_player_id}"
    push_repo.save(
        player_id=x_player_id,
        endpoint=sentinel_endpoint,
        p256dh="",
        auth="",
        preferences={"loot_level4": True, "war_start": True, "stakeout_change": True},
    )
    # Set channel to pda (save() defaults to webpush)
    push_repo.mutate(
        "UPDATE push_subscriptions SET channel = 'pda' WHERE endpoint = ?",
        (sentinel_endpoint,),
    )
    return {"status": "ok"}


@router.get("/pda/poll")
async def pda_poll(x_player_id: int = Header()):
    """Get pending notifications for this PDA player. Marks them as delivered."""
    _verify_member(x_player_id)
    if not event_repo:
        return {"events": []}
    pending = event_repo.get_pending_pda(x_player_id)
    for p in pending:
        event_repo.mark_delivered(p["delivery_id"])
    return {
        "events": [
            {
                "event_id": p["event_id"],
                "title": p["title"],
                "body": p["body"],
                "url": p["url"],
                "icon": p["icon"],
                "created_at": p["created_at"],
            }
            for p in pending
        ]
    }


@router.delete("/pda/unregister")
async def pda_unregister(x_player_id: int = Header()):
    """Unregister PDA channel for this player."""
    _verify_member(x_player_id)
    push_repo.delete_by_endpoint(f"pda:{x_player_id}")
    return {"status": "ok"}
