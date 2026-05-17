from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header, Request
from api.db.repos.notifications import NotificationRepository
from api.utils.etag import etag_response

logger = logging.getLogger("tm-hub.notifications")

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
notification_repo: NotificationRepository | None = None  # Set by main.py
key_store = None  # Set by main.py


def _verify_member(player_id: int) -> None:
    if not notification_repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    if not key_store.has_key(player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


@router.get("")
async def list_notifications(x_player_id: int = Header()):
    _verify_member(x_player_id)
    notifications = notification_repo.get_recent(x_player_id, 50)
    unread = notification_repo.get_unread_count(x_player_id)
    return {"notifications": notifications, "unread": unread}


@router.get("/unread")
async def unread_count(request: Request, x_player_id: int = Header()):
    _verify_member(x_player_id)
    return etag_response(
        {"unread": notification_repo.get_unread_count(x_player_id)},
        request,
        cache_control="private, max-age=5, stale-while-revalidate=30",
    )


@router.post("/read-all")
async def mark_all_read(x_player_id: int = Header()):
    _verify_member(x_player_id)
    notification_repo.mark_all_read(x_player_id)
    return {"status": "ok"}


@router.post("/read/{notification_id}")
async def mark_read(notification_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    notification_repo.mark_read(x_player_id, notification_id)
    return {"status": "ok"}
