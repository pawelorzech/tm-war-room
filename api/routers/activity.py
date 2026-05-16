"""Per-player activity tracking endpoints (Phase 3A).

Read API: ``GET /api/activity/{player_id}`` returns a 7x24 UTC heatmap
aggregated over the last 14 days, plus the suggested 4-hour attack window.

Write API: ``POST /api/activity/track/{player_id}`` enrolls an outsider for
continuous tracking. Called by the Companion userscript whenever a faction
member opens a Torn profile. Idempotent — already-enrolled players (or
faction members, who are tracked automatically) return 204 without a DB write.
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Header, HTTPException, Response

from api.activity import aggregate_heatmap, format_window, most_active_window
from api.auth import rate_limiter
from api.config import ENABLE_ACTIVITY

logger = logging.getLogger("tm-hub.activity")

router = APIRouter(prefix="/api/activity", tags=["activity"])

# Module-level state set by main.py lifespan (Phase 0 wired these).
key_store = None
torn_client = None
activity_repo = None

RETENTION_DAYS: int = 14
RETENTION_SECONDS: int = RETENTION_DAYS * 86400


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    """Always-on health probe — flag-gating it would defeat the purpose."""
    return {"ok": True}


def _require_enabled() -> None:
    if not ENABLE_ACTIVITY:
        raise HTTPException(status_code=503, detail="feature disabled")


def _require_repo():
    if activity_repo is None:
        raise HTTPException(status_code=503, detail="activity not initialized")


@router.get("/{player_id}")
async def get_activity(player_id: int) -> dict:
    """Return the 14-day UTC heatmap + suggested attack window for *player_id*.

    Response shape::

        {
            "bins": [[int] * 24] * 7,         # weekday × hour, total seconds
            "most_active_window": "HH:00-HH:00 UTC",
        }

    Bin matrix is dense — every (weekday, hour) cell exists even when zero —
    so clients can render without null-checking.
    """
    _require_enabled()
    _require_repo()

    if player_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid player_id")

    since = int(time.time()) - RETENTION_SECONDS
    rows = activity_repo.bins_for(player_id, since=since)
    pairs: list[tuple[int, int]] = [
        (int(r["bin_start"]), int(r["online_seconds"])) for r in rows
    ]
    heatmap = aggregate_heatmap(pairs)
    start, end = most_active_window(heatmap)
    return {
        "bins": heatmap,
        "most_active_window": format_window(start, end),
    }


@router.post("/track/{player_id}", status_code=204)
async def track_player(player_id: int, x_player_id: int = Header()) -> Response:
    """Enroll an outsider for continuous tracking. Idempotent.

    Faction members are already tracked by the scheduler tick, so the call is
    a no-op for them — but still returns 204 so the Companion doesn't have to
    branch on "is this player a faction member" before calling.
    """
    _require_enabled()
    _require_repo()

    if player_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid player_id")

    # Rate-limit by caller (the faction member viewing profiles), not by
    # target player_id — that would let a single user spam thousands of
    # enrollments. 30 enrollments per 60s comfortably covers normal browsing.
    if not rate_limiter.check(
        f"activity_track:{x_player_id}",
        max_requests=30,
        window_seconds=60,
    ):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # Faction members are tracked automatically; don't pollute the outsider
    # table with rows we already cover via the roster.
    if key_store is not None and key_store.has_key(player_id):
        return Response(status_code=204)

    try:
        activity_repo.enroll_outsider(player_id=player_id, now=int(time.time()))
    except Exception as e:
        logger.warning("enroll_outsider(%d) failed: %s", player_id, e)
        raise HTTPException(status_code=500, detail="enrollment failed")

    return Response(status_code=204)
