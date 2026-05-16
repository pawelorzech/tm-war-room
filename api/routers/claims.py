"""Hit-claiming endpoints (Phase 0 stub).

Phase 4 wires the claim/release/hit flow + companion overlay.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

logger = logging.getLogger("tm-hub.claims")

router = APIRouter(prefix="/api/claims", tags=["claims"])

# Module-level state set by main.py lifespan (Phase 4 fills these in).
key_store = None
torn_client = None
claim_repo = None


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
