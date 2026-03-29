from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException
from api.db.repos.notifications import NotificationRepository

logger = logging.getLogger("tm-hub.notifications")

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
notification_repo: NotificationRepository | None = None  # Set by main.py


@router.get("")
async def list_notifications():
    if not notification_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    notifications = notification_repo.get_recent(50)
    unread = notification_repo.get_unread_count()
    return {"notifications": notifications, "unread": unread}


@router.get("/unread")
async def unread_count():
    if not notification_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    return {"unread": notification_repo.get_unread_count()}


@router.post("/read-all")
async def mark_all_read():
    if not notification_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    notification_repo.mark_all_read()
    return {"status": "ok"}


@router.post("/read/{notification_id}")
async def mark_read(notification_id: int):
    if not notification_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    notification_repo.mark_read(notification_id)
    return {"status": "ok"}
