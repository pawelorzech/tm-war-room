"""Travel / flight tracking endpoints (Phase 0 stub).

Phase 2 wires real data ingestion + read APIs. This module only exposes a
healthz so Phase 0 wiring can be smoke-tested.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

logger = logging.getLogger("tm-hub.flights")

router = APIRouter(prefix="/api/flights", tags=["flights"])

# Module-level state set by main.py lifespan (Phase 2 fills these in).
key_store = None
torn_client = None
flight_repo = None


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
