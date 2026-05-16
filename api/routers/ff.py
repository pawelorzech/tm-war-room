"""Fair-fight score endpoints (Phase 0 stub).

Business logic lands in Phase 1. This module only exposes a healthz so the
router wiring + module-level state injection can be verified end-to-end.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

logger = logging.getLogger("tm-hub.ff")

router = APIRouter(prefix="/api/ff", tags=["ff"])

# Module-level state set by main.py lifespan (Phase 1 fills these in).
key_store = None
torn_client = None
ff_repo = None


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    """Liveness probe. Always returns ok regardless of dependency state so
    Phase 0 smoke tests don't depend on the full app lifespan."""
    return {"ok": True}
