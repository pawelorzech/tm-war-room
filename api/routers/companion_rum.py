"""TM Hub Companion RUM (Real User Monitoring) beacon endpoint.

Sprint 0 of the Companion performance optimization plan. Accepts anonymous
performance signals from the userscript so we can measure real-user perf
without bundling a third-party SDK (~22 KB gzip for Sentry would defeat the
whole point of a perf audit on a 44 KB bundle).

What's allowed and what isn't is exhaustively documented in
``extension/docs/rum-privacy-review.md``. The schema below is the
single source of truth that the privacy doc references; if the two ever
diverge, the doc wins and code is wrong.

Defence in depth:
1. Pydantic schema rejects unknown fields (``extra='forbid'``).
2. Pathological values (negative timings, absurd ceilings) raise 422.
3. Rate limit at 1 req / min / IP via the existing rate_limiter.
4. ``ENABLE_RUM`` config flag short-circuits the handler to 204 with no
   persistence — Sprint 0 ships the endpoint dark by default.
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from api.auth import rate_limiter
from api.config import ENABLE_RUM

logger = logging.getLogger("tm-hub.companion-rum")

router = APIRouter(prefix="/api/companion", tags=["companion-rum"])

PageKind = Literal[
    "profile", "attack", "faction", "market", "bounties", "imarket",
    "oc", "hospital", "jail", "halloffame", "travel", "ambient",
    "armoury", "retals", "stocks", "unknown",
]

# Sanity ceilings. Time-to-interactive over 60s is either a clock skew, a
# tab put to sleep mid-boot, or somebody poisoning the aggregate.
MAX_TIMING_MS = 60_000
MAX_COUNT = 1_000

# Test hook: the most recent persisted payload (or None). Lets the test
# suite assert PII fields are stripped without standing up a DB layer.
_last_persisted: Optional[dict] = None


class RumBeacon(BaseModel):
    model_config = ConfigDict(extra="forbid")

    v: str = Field(min_length=1, max_length=32)
    page_kind: PageKind
    tti_ms: int = Field(ge=0, le=MAX_TIMING_MS)
    tbt_ms: int = Field(ge=0, le=MAX_TIMING_MS)
    fcp_ms: Optional[int] = Field(default=None, ge=0, le=MAX_TIMING_MS)
    longtask_count: int = Field(ge=0, le=MAX_COUNT)
    polls_per_min_visible: int = Field(ge=0, le=MAX_COUNT)
    polls_per_min_hidden: int = Field(ge=0, le=MAX_COUNT)
    errors: int = Field(ge=0, le=MAX_COUNT)
    ts: str = Field(min_length=1, max_length=40)


@router.post("/rum", status_code=204)
async def receive_rum(beacon: RumBeacon, request: Request) -> Response:
    """Persist an anonymous performance beacon.

    Returns 204 No Content on success. 422 on schema violation (handled by
    FastAPI). 429 when the per-IP minute window is exhausted.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.check(f"rum:{client_ip}", max_requests=1, window_seconds=60):
        raise HTTPException(status_code=429, detail="Rate limited")

    if not ENABLE_RUM:
        # Dark mode: accept the payload (so the Companion can no-op cleanly
        # rather than seeing 5xx and retrying), but don't persist.
        return Response(status_code=204)

    # Persistence stub. Sprint 1 lands the SQLite table + hourly aggregation
    # job. For now we structured-log; the field set matches the migration so
    # the cutover is mechanical.
    payload = beacon.model_dump()
    global _last_persisted
    _last_persisted = payload
    logger.info("rum beacon", extra={"rum": payload})
    return Response(status_code=204)
