from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

logger = logging.getLogger("tm-hub.push")

router = APIRouter(prefix="/api/push", tags=["push"])
push_repo = None       # Set by main.py
push_service = None    # Set by main.py
vapid_public_key = None  # Set by main.py


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}
    preferences: dict = {}


class PreferencesRequest(BaseModel):
    preferences: dict


@router.get("/vapid-key")
async def get_vapid_key():
    return {"vapid_public_key": vapid_public_key, "enabled": vapid_public_key is not None}


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest, x_player_id: int = Header()):
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.save(
        player_id=x_player_id,
        endpoint=req.endpoint,
        p256dh=req.keys.get("p256dh", ""),
        auth=req.keys.get("auth", ""),
        preferences=req.preferences,
    )
    return {"status": "subscribed"}


@router.put("/preferences")
async def update_preferences(req: PreferencesRequest, x_player_id: int = Header()):
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.update_preferences(x_player_id, req.preferences)
    return {"status": "updated"}


@router.delete("/unsubscribe")
async def unsubscribe(endpoint: str, x_player_id: int = Header()):
    if not push_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    push_repo.delete_by_endpoint(endpoint)
    return {"status": "unsubscribed"}
