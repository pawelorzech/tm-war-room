from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

from api.db.repos.pinned_navs import PinnedNavsRepository

logger = logging.getLogger("tm-hub.preferences")

router = APIRouter(prefix="/api/preferences", tags=["preferences"])
pinned_navs_repo: PinnedNavsRepository | None = None  # Set by main.py
key_store = None  # Set by main.py

# Hard cap to prevent abuse — matches frontend MAX_PINNED.
MAX_PINNED_HREFS = 32
MAX_HREF_LEN = 200


class PinnedNavsBody(BaseModel):
    hrefs: list[str] = Field(default_factory=list)


def _verify_member(player_id: int) -> None:
    if not pinned_navs_repo or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    if not key_store.has_key(player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


@router.get("/pinned-navs")
async def get_pinned_navs(x_player_id: int = Header()):
    _verify_member(x_player_id)
    return {"hrefs": pinned_navs_repo.list_for(x_player_id)}


@router.put("/pinned-navs")
async def set_pinned_navs(body: PinnedNavsBody, x_player_id: int = Header()):
    _verify_member(x_player_id)
    # Sanitize: strip, dedupe preserving order, cap length and count, only allow internal paths.
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in body.hrefs:
        h = (raw or "").strip()
        if not h or len(h) > MAX_HREF_LEN:
            continue
        if not h.startswith("/"):
            continue
        if h in seen:
            continue
        seen.add(h)
        cleaned.append(h)
        if len(cleaned) >= MAX_PINNED_HREFS:
            break
    pinned_navs_repo.set_for(x_player_id, cleaned)
    return {"hrefs": cleaned}
