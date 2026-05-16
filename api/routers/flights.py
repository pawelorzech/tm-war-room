"""Travel / flight tracking endpoints (FFScouter parity, Phase 2A).

Three endpoints once the feature flag is on:

* ``GET /api/flights/healthz`` — liveness probe (always 200 regardless of flag).
* ``GET /api/flights/active`` — every player currently in the air, with
  predicted landing time. Used by the dashboard "Who's flying?" panel and
  the Companion overlay.
* ``GET /api/flights/{player_id}`` — per-player snapshot: current open
  flight (or null) + last 30 days of completed flights.

The 503-when-disabled behaviour is intentional. Returning empty lists would
make the frontend silently render a stale state when the flag flips off, so
we force the caller to handle the disabled case explicitly.
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException

from api import config
from api.flights import predict_landing

logger = logging.getLogger("tm-hub.flights")

router = APIRouter(prefix="/api/flights", tags=["flights"])

# Module-level state set by main.py lifespan.
key_store = None
torn_client = None
flight_repo = None


def _require_enabled() -> None:
    """Raise 503 unless the ENABLE_FLIGHTS flag is set in config.

    We re-read ``config.ENABLE_FLIGHTS`` (not a closure-bound copy) so a
    test can ``monkeypatch.setattr(config, "ENABLE_FLIGHTS", True)`` and the
    next request honours the flip — important for ``test_flights_route``."""
    if not config.ENABLE_FLIGHTS:
        raise HTTPException(status_code=503, detail="feature disabled")


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@router.get("/active")
async def active_flights() -> dict:
    """List currently-airborne tracked players + predicted landings.

    Shape: ``{flights: [...], cached_at: <unix ts>}``. Each flight row
    carries the raw DB columns plus a derived ``predicted_landed_at`` field
    so the frontend doesn't need its own copy of the durations table."""
    _require_enabled()
    if flight_repo is None:
        raise HTTPException(status_code=503, detail="not initialized")

    rows = flight_repo.active_flights()
    enriched = []
    for r in rows:
        predicted = predict_landing(
            int(r["departed_at"]),
            str(r["destination"]),
            str(r["ticket_class"]),
        )
        enriched.append({**r, "predicted_landed_at": predicted})

    return {"flights": enriched, "cached_at": int(time.time())}


@router.get("/{player_id}")
async def player_flights(player_id: int) -> dict:
    """Per-player snapshot.

    ``current`` is the open flight row (or ``None`` if the player is on the
    ground); ``history`` is up to 30 days of completed flights ordered
    newest-first.
    """
    _require_enabled()
    if flight_repo is None:
        raise HTTPException(status_code=503, detail="not initialized")

    current = flight_repo.most_recent_open(player_id)
    if current is not None:
        current = {
            **current,
            "predicted_landed_at": predict_landing(
                int(current["departed_at"]),
                str(current["destination"]),
                str(current["ticket_class"]),
            ),
        }

    since = int(time.time()) - 30 * 24 * 3600
    history = flight_repo.history_for(player_id, since=since, limit=200)
    return {"current": current, "history": history}
