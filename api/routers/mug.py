from __future__ import annotations
import logging
import time
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from api.mug_score import MugSignals, MUG_COOLDOWN_HOURS, compute_mug_score

logger = logging.getLogger("tm-hub.mug")

router = APIRouter(prefix="/api/mug", tags=["mug"])

# Injected by main.py lifespan (and by test fixtures).
key_store = None
mug_repo = None
target_repo = None
torn_client = None
spy_service = None
stats_repo = None


class InteractionRequest(BaseModel):
    seller_player_id: int
    kind: str = "trade"
    source: str = ""


class LoggedRequest(BaseModel):
    target_player_id: int


def _verify_member(player_id: int):
    if not key_store or not mug_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    if not key_store.has_key(player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


def _status_bucket(last_action_status: str) -> str:
    s = (last_action_status or "").capitalize()
    return s if s in ("Online", "Idle") else "Offline"


async def gather_signals(player_id: int, caller_id: int) -> MugSignals:
    """Build MugSignals for *player_id* from live Torn data + repos.

    Best-effort: missing data degrades to neutral fields. Never raises.
    """
    sig = MugSignals()
    now = int(time.time())

    try:
        from api.ff import _fetch_personalstats_total, _caller_total_from_keystore
        target_total, _ = await _fetch_personalstats_total(torn_client, player_id)
        sig.target_total = target_total
        sig.caller_total = await _caller_total_from_keystore(torn_client, key_store, caller_id)
    except Exception as exc:
        logger.warning("gather_signals: FF totals failed pid=%d: %s", player_id, exc)

    try:
        from api.torn_client import _json
        resp = await torn_client._http.get(
            f"https://api.torn.com/user/{player_id}",
            params={"selections": "profile,personalstats", "key": torn_client._api_key},
        )
        if resp.status_code == 200:
            raw = await _json(resp)
            ps = raw.get("personalstats", {}) or {}
            sig.networth = int(ps.get("networth", 0) or 0)
            sig.property_type = raw.get("property", "") or ""
            status = raw.get("status", {}) or {}
            state = status.get("state", "") or ""
            sig.in_hospital = state == "Hospital"
            sig.is_abroad = state in ("Traveling", "Abroad")
            sig.travel_destination = status.get("description", "") if sig.is_abroad else ""
            la = raw.get("last_action", {}) or {}
            sig.last_action_status = _status_bucket(la.get("status", "Offline"))
            sig.casino_activity = int(ps.get("slotmachineplays", 0) or 0) + int(ps.get("rouletteplays", 0) or 0)
    except Exception as exc:
        logger.warning("gather_signals: profile fetch failed pid=%d: %s", player_id, exc)

    last_mug = mug_repo.last_mug_at(caller_id, player_id)
    if last_mug is not None:
        elapsed_h = (now - last_mug) / 3600.0
        sig.mug_cooldown_remaining_h = max(0.0, MUG_COOLDOWN_HOURS - elapsed_h)

    last_trade = mug_repo.last_trade_at(caller_id, player_id)
    if last_trade is not None:
        sig.fresh_cash_age_min = max(0.0, (now - last_trade) / 60.0)

    return sig


@router.get("/score/{player_id}")
async def score(player_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    sig = await gather_signals(player_id, x_player_id)
    result = compute_mug_score(sig)
    return {
        "player_id": player_id,
        "score": result.score,
        "tier": result.tier,
        "hittable_now": result.hittable_now,
        "breakdown": result.breakdown,
    }


@router.get("/candidates")
async def candidates(x_player_id: int = Header()):
    _verify_member(x_player_id)
    out = []
    for t in target_repo.get_all():
        sig = await gather_signals(t["player_id"], x_player_id)
        result = compute_mug_score(sig)
        out.append({
            "player_id": t["player_id"],
            "player_name": t.get("player_name"),
            "score": result.score,
            "tier": result.tier,
            "hittable_now": result.hittable_now,
            "breakdown": result.breakdown,
        })
    out.sort(key=lambda c: c["score"], reverse=True)
    return {"candidates": out, "count": len(out)}


@router.post("/interaction")
async def interaction(body: InteractionRequest, x_player_id: int = Header()):
    _verify_member(x_player_id)
    mug_repo.add_trade(x_player_id, body.seller_player_id, body.kind, body.source, int(time.time()))
    return {"status": "ok"}


@router.post("/logged")
async def logged(body: LoggedRequest, x_player_id: int = Header()):
    _verify_member(x_player_id)
    mug_repo.log_mug(x_player_id, body.target_player_id, int(time.time()))
    return {"status": "ok"}
