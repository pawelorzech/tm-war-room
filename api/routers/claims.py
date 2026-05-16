"""Hit-calling endpoints (Phase 4A).

POST /api/claims/{target_id}        — claim a target for 15 min
DELETE /api/claims/{target_id}      — release your own claim early
POST /api/claims/{target_id}/hit    — mark your claim as a successful hit
GET /api/claims/active              — list active claims for the caller's faction
GET /api/claims/stream              — SSE stream of claim state changes
GET /api/claims/healthz             — liveness probe (no auth)

All write endpoints return 503 when ``ENABLE_HIT_CALLING`` is off so the
companion can dark-launch the overlay safely.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.auth import rate_limiter
from api.config import ENABLE_HIT_CALLING, FACTION_ID, SUPERADMIN_IDS

logger = logging.getLogger("tm-hub.claims")

router = APIRouter(prefix="/api/claims", tags=["claims"])

# Module-level state set by main.py lifespan.
key_store = None
torn_client = None
claim_repo = None
claim_manager = None

# Spec-locked: 15 minutes auto-expire.
DEFAULT_TTL_SECONDS = 900
# A 96-byte short message — anything longer belongs in chat.
MAX_NOTE_LENGTH = 96


def _require_flag() -> None:
    if not ENABLE_HIT_CALLING:
        raise HTTPException(status_code=503, detail="Hit calling disabled")


def _require_member(player_id: int) -> None:
    if key_store is None or not key_store.has_key(player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


def _is_admin(player_id: int) -> bool:
    if player_id in SUPERADMIN_IDS:
        return True
    return bool(key_store and key_store.is_admin(player_id))


def _player_name(player_id: int) -> Optional[str]:
    """Resolve the claimer's display name. Falls back to None when unknown."""
    if key_store is None:
        return None
    try:
        entry = key_store.get_key(player_id)
    except Exception:
        return None
    return entry["player_name"] if entry else None


def _decorate(row: dict) -> dict:
    """Attach ``claimer_name`` so the companion doesn't need a second lookup."""
    out = dict(row)
    out["claimer_name"] = _player_name(out.get("claimer_id"))
    return out


def _publish(event_type: str, row: dict) -> None:
    """Fire-and-forget publish; caller doesn't await Redis."""
    if claim_manager is None:
        return
    payload = {"type": event_type, "claim": _decorate(row)}
    # Schedule rather than await so the HTTP response isn't blocked on Redis.
    try:
        asyncio.get_running_loop().create_task(
            claim_manager.publish(payload, FACTION_ID)
        )
    except RuntimeError:
        # No running loop (shouldn't happen inside FastAPI handlers, but
        # defensive for unit tests that exercise routers directly).
        pass


# ── Schemas ──────────────────────────────────────────────────────


class ClaimCreate(BaseModel):
    note: Optional[str] = Field(default=None, max_length=MAX_NOTE_LENGTH)


# ── Routes ───────────────────────────────────────────────────────


@router.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@router.post("/{target_id}", status_code=201)
async def create_claim(
    target_id: int,
    body: ClaimCreate | None = None,
    x_player_id: int = Header(),
):
    _require_flag()
    _require_member(x_player_id)
    if target_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid target_id")
    if claim_repo is None:
        raise HTTPException(status_code=503, detail="Claims not initialized")
    # Light per-player rate limit — 30 claim attempts per minute. Re-uses
    # the shared HybridRateLimiter so it works cluster-wide with Redis.
    if not rate_limiter.check(
        f"claim:{x_player_id}", max_requests=30, window_seconds=60,
    ):
        raise HTTPException(status_code=429, detail="Too many claim attempts")

    note = (body.note.strip() if body and body.note else None) or None
    now = int(time.time())
    status, row = claim_repo.claim(
        target_id=target_id,
        claimer_id=x_player_id,
        now=now,
        ttl_seconds=DEFAULT_TTL_SECONDS,
        note=note,
    )
    if status == "conflict":
        # 409 with the existing claim so the UI can show who got there first.
        return _conflict_response(row)
    _publish("claim.created", row)
    return _decorate(row)


@router.delete("/{target_id}")
async def release_claim(target_id: int, x_player_id: int = Header()):
    _require_flag()
    _require_member(x_player_id)
    if claim_repo is None:
        raise HTTPException(status_code=503, detail="Claims not initialized")

    existing = claim_repo.get(target_id)
    if not existing or existing["status"] != "active":
        raise HTTPException(status_code=404, detail="No active claim on this target")
    if existing["claimer_id"] != x_player_id and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Only the claimer or an admin can release this claim")

    now = int(time.time())
    # Admin override path: bypass the owner check by impersonating the
    # row's claimer for the UPDATE so the (claimer_id, target_id) predicate
    # still matches exactly one row.
    target_claimer = existing["claimer_id"]
    ok = claim_repo.release(target_id=target_id, claimer_id=target_claimer, now=now)
    if not ok:
        # Concurrent state change — surface as 409 so the client refetches.
        raise HTTPException(status_code=409, detail="Claim is no longer active")
    updated = claim_repo.get(target_id) or {**existing, "status": "released"}
    _publish("claim.released", updated)
    return _decorate(updated)


@router.post("/{target_id}/hit")
async def mark_hit(target_id: int, x_player_id: int = Header()):
    _require_flag()
    _require_member(x_player_id)
    if claim_repo is None:
        raise HTTPException(status_code=503, detail="Claims not initialized")

    existing = claim_repo.get(target_id)
    if not existing or existing["status"] != "active":
        raise HTTPException(status_code=404, detail="No active claim on this target")
    if existing["claimer_id"] != x_player_id:
        # Mark-hit is the claimer's action — admin can release but not claim
        # someone else's kill credit. Different from DELETE on purpose.
        raise HTTPException(status_code=403, detail="Only the claimer can mark a hit")

    now = int(time.time())
    ok = claim_repo.mark_hit(target_id=target_id, claimer_id=x_player_id, now=now)
    if not ok:
        raise HTTPException(status_code=409, detail="Claim is no longer active")
    updated = claim_repo.get(target_id) or {**existing, "status": "hit"}
    _publish("claim.hit", updated)
    return _decorate(updated)


@router.get("/active")
async def list_active(x_player_id: int = Header()):
    _require_flag()
    _require_member(x_player_id)
    if claim_repo is None:
        raise HTTPException(status_code=503, detail="Claims not initialized")
    # All registered members are TM faction members (enforced at registration),
    # so the visible set is everyone with a key.
    member_ids = [k["player_id"] for k in key_store.get_keys_metadata()]
    rows = claim_repo.active_claims_for_faction(member_ids)
    return {"claims": [_decorate(r) for r in rows], "cached_at": int(time.time())}


@router.get("/stream")
async def stream_claims(request: Request, x_player_id: int = Header()):
    _require_flag()
    _require_member(x_player_id)
    if claim_manager is None:
        raise HTTPException(status_code=503, detail="Claims not initialized")

    async def event_source():
        # Initial replay: send the current active set so a fresh connection
        # doesn't have to do a second GET /api/claims/active.
        if claim_repo is not None and key_store is not None:
            member_ids = [k["player_id"] for k in key_store.get_keys_metadata()]
            initial = claim_repo.active_claims_for_faction(member_ids)
            yield _sse_frame(
                {
                    "type": "claim.snapshot",
                    "claims": [_decorate(r) for r in initial],
                    "faction_id": FACTION_ID,
                    "ts": int(time.time()),
                }
            )
        # Live stream — exits when the manager pushes None on shutdown, or
        # when the client disconnects (Starlette cancels the generator).
        try:
            async for envelope in claim_manager.stream(FACTION_ID):
                if await request.is_disconnected():
                    return
                yield _sse_frame(envelope)
        except asyncio.CancelledError:
            return

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        # nginx-specific: disable response buffering on this endpoint so
        # events reach the client without delay.
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        event_source(), media_type="text/event-stream", headers=headers,
    )


# ── Helpers ──────────────────────────────────────────────────────


def _sse_frame(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n".encode("utf-8")


def _conflict_response(existing_row: dict):
    """Raise a 409 carrying the existing claim so the UI can show the holder."""
    raise HTTPException(
        status_code=409,
        detail={"detail": "already claimed", "claim": _decorate(existing_row)},
    )
