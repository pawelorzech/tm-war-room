"""Per-player activity tracking endpoints (Phase 0 stub).

Phase 3 owns the bin sizing, outsider enrollment hook, and read APIs.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

logger = logging.getLogger("tm-hub.activity")

router = APIRouter(prefix="/api/activity", tags=["activity"])

# Module-level state set by main.py lifespan (Phase 3 fills these in).
key_store = None
torn_client = None
activity_repo = None


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
