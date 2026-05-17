"""Fair-fight score endpoints — FFScouter parity Phase 1A.

Exposes ``GET /api/ff/{player_id}`` for the Companion's FF chip overlay.

Behaviour:
- Gated by ``ENABLE_FF_SCORE`` feature flag (503 when off so the Companion
  can probe the endpoint without false positives).
- Cached in ``ff_scores`` table with 6h TTL. Fresh rows short-circuit the
  Torn-API fetch entirely.
- Rate-limited per caller via the shared ``rate_limiter`` (60 req/min) —
  same pattern as ``api/routers/chat.py``. The browser overlay should call
  it once per profile-view, not in a loop.

Auth: relies on the global ``enforce_api_auth`` middleware (JWT + X-Player-Id)
— no per-route guard needed. The middleware rejects anonymous requests with
401 before they reach this handler.
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from api.auth import rate_limiter
from api.config import ENABLE_FF_SCORE
from api.ff import FF_TTL_SECONDS, compute_ff
from api.utils.etag import etag_response

logger = logging.getLogger("tm-hub.ff")

router = APIRouter(prefix="/api/ff", tags=["ff"])

# Module-level state set by main.py lifespan. Tests patch these directly.
key_store = None
torn_client = None
ff_repo = None
# Optional dependencies — wired by main.py when available, None-safe when not.
spy_service = None
stats_repo = None


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    """Liveness probe. Returns ok regardless of dependency state so Phase 0
    smoke tests pass without the full app lifespan."""
    return {"ok": True}


@router.get("/{player_id}")
async def get_ff_score(player_id: int, request: Request, x_player_id: int = Header()):
    """Return a cached or freshly-computed fair-fight score for *player_id*.

    Response shape::

        {
            "player_id": int,
            "score": float,    # FFScouter formula, clamped >= 1.0
            "dom_stat": "STR" | "DEF" | "SPD" | "DEX",
            "source": "spy" | "formula",
            "computed_at": int,  # unix epoch seconds
            "expires_at": int,
        }

    Returns 503 when the feature flag is off — Companion treats that as
    "feature unavailable" and hides the chip. Returns 429 when the caller
    blew through the rate-limit. Returns 500 only on unexpected exceptions
    (Torn API hiccups produce a low-confidence formula score, not an error).
    """
    if not ENABLE_FF_SCORE:
        raise HTTPException(status_code=503, detail="feature disabled")

    # Per-caller throttle — Companion calls once per profile view, but a
    # buggy build could fire on every render. 60/min is generous enough
    # that legitimate users never hit it.
    if not rate_limiter.check(f"ff:{x_player_id}", max_requests=60, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many FF lookups, slow down")

    now = int(time.time())

    # Cache hit short-circuits: most profile views hit a warm cache and
    # never touch Torn. Stale rows fall through to recompute.
    if ff_repo is not None:
        cached = ff_repo.get(player_id)
        if cached and cached.get("expires_at", 0) > now:
            return etag_response(
                {
                    "player_id": player_id,
                    "score": cached["score"],
                    "dom_stat": cached["dom_stat"],
                    "source": cached["source"],
                    "computed_at": cached["computed_at"],
                    "expires_at": cached["expires_at"],
                },
                request,
                cache_control="private, max-age=300, stale-while-revalidate=600",
            )

    if torn_client is None or key_store is None:
        # Phase 0 wiring should always set these; missing means a deploy bug.
        raise HTTPException(status_code=503, detail="FF service not initialized")

    result = await compute_ff(
        player_id=player_id,
        caller_id=x_player_id,
        torn_client=torn_client,
        key_store=key_store,
        spy_service=spy_service,
        stats_repo=stats_repo,
        now=now,
        ttl_seconds=FF_TTL_SECONDS,
    )

    if ff_repo is not None:
        try:
            ff_repo.upsert(
                player_id=player_id,
                score=result["score"],
                dom_stat=result["dom_stat"],
                source=result["source"],
                ttl_seconds=FF_TTL_SECONDS,
                now=now,
            )
        except Exception as exc:
            # Persisting is best-effort — return the score even if the cache
            # write blows up (e.g. disk full, constraint surprise). Next
            # call will recompute, no user-visible breakage.
            logger.warning("ff_repo.upsert failed for pid=%d: %s", player_id, exc)

    return etag_response(
        {
            "player_id": player_id,
            "score": result["score"],
            "dom_stat": result["dom_stat"],
            "source": result["source"],
            "computed_at": result["computed_at"],
            "expires_at": result["expires_at"],
        },
        request,
        cache_control="private, max-age=300, stale-while-revalidate=600",
    )


class BulkRequest(BaseModel):
    """Sprint 2 #9 — bulk FF lookup.

    Caller-side use case: faction-roster-overlay decorates every visible
    enemy on /factions.php?step=profile (often 50-100 members). Today it
    fires N sequential GET /api/ff/{id} calls; this endpoint takes the
    full list and returns the same results in one round-trip.

    Cap at 100 ids — largest legitimate batch is "one faction roster".
    """

    player_ids: list[int] = Field(min_length=0, max_length=100)


@router.post("/bulk")
async def get_ff_scores_bulk(
    body: BulkRequest, x_player_id: int = Header()
) -> dict:
    """Resolve FF scores for many ``player_ids`` in one call.

    Behaviour mirrors :func:`get_ff_score` per id: cache hit short-circuits,
    cache miss runs ``compute_ff`` (which can fall back to the formula
    path when no spy data is available). Repeated ids are deduped.
    Returns 503 when the feature flag is off.
    """
    if not ENABLE_FF_SCORE:
        raise HTTPException(status_code=503, detail="feature disabled")
    if not rate_limiter.check(
        f"ff-bulk:{x_player_id}", max_requests=20, window_seconds=60
    ):
        raise HTTPException(status_code=429, detail="Too many bulk lookups, slow down")

    if not body.player_ids:
        return {"scores": {}}

    if any(pid <= 0 for pid in body.player_ids):
        raise HTTPException(status_code=422, detail="player_ids must be positive")

    now = int(time.time())
    unique_ids = list(dict.fromkeys(body.player_ids))

    scores: dict[str, dict] = {}
    misses: list[int] = []

    if ff_repo is not None:
        for pid in unique_ids:
            cached = ff_repo.get(pid)
            if cached and cached.get("expires_at", 0) > now:
                scores[str(pid)] = {
                    "score": cached["score"],
                    "dom_stat": cached["dom_stat"],
                    "source": cached["source"],
                    "computed_at": cached["computed_at"],
                    "expires_at": cached["expires_at"],
                }
            else:
                misses.append(pid)
    else:
        misses = list(unique_ids)

    if misses and (torn_client is None or key_store is None):
        raise HTTPException(status_code=503, detail="FF service not initialized")

    for pid in misses:
        try:
            result = await compute_ff(
                player_id=pid,
                caller_id=x_player_id,
                torn_client=torn_client,
                key_store=key_store,
                spy_service=spy_service,
                stats_repo=stats_repo,
                now=now,
                ttl_seconds=FF_TTL_SECONDS,
            )
        except Exception as exc:
            # Per-id failure does not poison the batch.
            logger.warning("ff bulk: compute failed for pid=%d: %s", pid, exc)
            continue

        scores[str(pid)] = {
            "score": result["score"],
            "dom_stat": result["dom_stat"],
            "source": result["source"],
            "computed_at": result["computed_at"],
            "expires_at": result["expires_at"],
        }
        if ff_repo is not None:
            try:
                ff_repo.upsert(
                    player_id=pid,
                    score=result["score"],
                    dom_stat=result["dom_stat"],
                    source=result["source"],
                    ttl_seconds=FF_TTL_SECONDS,
                    now=now,
                )
            except Exception as exc:
                logger.warning("ff bulk: upsert failed for pid=%d: %s", pid, exc)

    return {"scores": scores}
