from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from api.admin import require_admin

logger = logging.getLogger("tm-hub.admin-push")

router = APIRouter(prefix="/api/admin/push", tags=["admin-push"])

# Set by main.py during startup
template_repo = None
event_repo = None
group_repo = None
dispatcher = None


# ── Pydantic models ─────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    title_template: str
    body_template: str
    url_template: str | None = None
    icon: str | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    title_template: str | None = None
    body_template: str | None = None
    url_template: str | None = None
    icon: str | None = None


class SendNotification(BaseModel):
    template_id: int | None = None
    title: str | None = None
    body: str | None = None
    url: str | None = None
    icon: str | None = None
    target_type: str = "all"
    target_value: str | None = None
    variables: dict | None = None


class GroupCreate(BaseModel):
    name: str
    description: str | None = None
    member_ids: list[int] = []


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    add_members: list[int] = []
    remove_members: list[int] = []


# ── Templates ────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(admin: dict = Depends(require_admin)):
    return {"templates": template_repo.get_all()}


@router.post("/templates")
async def create_template(body: TemplateCreate, admin: dict = Depends(require_admin)):
    tid = template_repo.create(
        name=body.name,
        title_template=body.title_template,
        body_template=body.body_template,
        url_template=body.url_template,
        icon=body.icon,
        created_by=admin["sub"],
    )
    return {"id": tid}


@router.put("/templates/{template_id}")
async def update_template(template_id: int, body: TemplateUpdate, admin: dict = Depends(require_admin)):
    if not template_repo.get_by_id(template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    template_repo.update(template_id, **fields)
    return {"status": "ok"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: int, admin: dict = Depends(require_admin)):
    if not template_repo.get_by_id(template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    template_repo.delete(template_id)
    return {"status": "ok"}


# ── Send ─────────────────────────────────────────────────────

@router.post("/send")
async def send_notification(body: SendNotification, admin: dict = Depends(require_admin)):
    title = body.title or ""
    body_text = body.body or ""

    # If template_id provided and title/body empty, load from template
    if body.template_id and not title and not body_text:
        tmpl = template_repo.get_by_id(body.template_id)
        if not tmpl:
            raise HTTPException(status_code=404, detail="Template not found")
        title = tmpl["title_template"]
        body_text = tmpl["body_template"]
        if not body.url and tmpl.get("url_template"):
            body.url = tmpl["url_template"]

    if not title or not body_text:
        raise HTTPException(status_code=400, detail="Title and body are required")

    if body.target_type not in ("player", "all", "role", "group", "preference"):
        raise HTTPException(status_code=400, detail="Invalid target_type")

    event_id = dispatcher.send(
        title=title,
        body=body_text,
        url=body.url,
        icon=body.icon,
        target_type=body.target_type,
        target_value=body.target_value,
        sent_by=str(admin["sub"]),
        template_id=body.template_id,
        variables=body.variables,
    )
    logger.info("Admin %d sent push event %d to %s:%s", admin["sub"], event_id, body.target_type, body.target_value)
    return {"event_id": event_id}


@router.post("/test")
async def send_test(admin: dict = Depends(require_admin)):
    """Send a test notification to the admin themselves."""
    event_id = dispatcher.send(
        title="TM Hub Test Notification",
        body="If you see this, push notifications are working!",
        url="/notifications",
        target_type="player",
        target_value=str(admin["sub"]),
        sent_by=str(admin["sub"]),
    )
    return {"event_id": event_id}


# ── History ──────────────────────────────────────────────────

@router.get("/history")
async def list_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: dict = Depends(require_admin),
):
    events = event_repo.list_events(limit=limit, offset=offset)
    return {"events": events}


@router.get("/history/{event_id}")
async def get_history_detail(event_id: int, admin: dict = Depends(require_admin)):
    event = event_repo.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    deliveries = event_repo.get_deliveries_for_event(event_id)
    stats = event_repo.get_event_stats(event_id)
    return {"event": event, "deliveries": deliveries, "stats": stats}


# ── Groups ───────────────────────────────────────────────────

@router.get("/groups")
async def list_groups(admin: dict = Depends(require_admin)):
    return {"groups": group_repo.list_all()}


@router.post("/groups")
async def create_group(body: GroupCreate, admin: dict = Depends(require_admin)):
    gid = group_repo.create(body.name, body.description, created_by=admin["sub"])
    for pid in body.member_ids:
        group_repo.add_member(gid, pid)
    return {"id": gid}


@router.put("/groups/{group_id}")
async def update_group(group_id: int, body: GroupUpdate, admin: dict = Depends(require_admin)):
    if not group_repo.get_by_id(group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    if body.name or body.description is not None:
        group_repo.update(group_id, name=body.name, description=body.description)
    for pid in body.add_members:
        group_repo.add_member(group_id, pid)
    for pid in body.remove_members:
        group_repo.remove_member(group_id, pid)
    return {"status": "ok"}


@router.delete("/groups/{group_id}")
async def delete_group(group_id: int, admin: dict = Depends(require_admin)):
    if not group_repo.get_by_id(group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    group_repo.delete(group_id)
    return {"status": "ok"}


# ── Stats ────────────────────────────────────────────────────

@router.get("/stats")
async def push_stats(admin: dict = Depends(require_admin)):
    sub_stats = event_repo.get_subscription_stats()
    return {"subscriptions": sub_stats}
