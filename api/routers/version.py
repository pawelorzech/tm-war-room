from __future__ import annotations
from fastapi import APIRouter, Header, Query
from pydantic import BaseModel
from api.db.repos.version_dismissals import VersionDismissalRepository

router = APIRouter(prefix="/api/version", tags=["version"])
dismissal_repo: VersionDismissalRepository | None = None  # Set by main.py


class DismissRequest(BaseModel):
    version: str


@router.get("/status")
async def version_status(v: str = Query(), x_player_id: int = Header()):
    if not dismissal_repo:
        return {"dismissed": False}
    return {"dismissed": dismissal_repo.is_dismissed(x_player_id, v)}


@router.post("/dismiss")
async def version_dismiss(req: DismissRequest, x_player_id: int = Header()):
    if dismissal_repo:
        dismissal_repo.dismiss(x_player_id, req.version)
    return {"ok": True}
