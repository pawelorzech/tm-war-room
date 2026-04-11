from __future__ import annotations
import asyncio
import logging
from fastapi import APIRouter, HTTPException, Header, Query

from api.threat import compute_threat, compute_stat_threat
from api.models import PersonalStats
from api.stat_estimator import estimate_stats

logger = logging.getLogger("tm-hub.bounties")

router = APIRouter(prefix="/api/bounties", tags=["bounties"])
torn_client = None  # Set by main.py
key_store = None  # Set by main.py
spy_service = None  # Set by main.py

# Max targets to look up personalstats for (API rate limiting)
MAX_PROFILE_LOOKUPS = 15


@router.get("")
async def list_bounties(
    x_player_id: int | None = Header(default=None),
):
    """Get available bounties with threat assessment."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    raw = await torn_client.fetch_bounties()
    logger.info("Bounties raw: type=%s, len=%s, sample=%s",
                type(raw).__name__, len(raw) if raw else 0,
                str(raw[0])[:100] if raw and len(raw) > 0 else "empty")

    bounties = []
    for b in raw:
        if not isinstance(b, dict):
            continue
        bounties.append({
            "target_id": b.get("target_id") or b.get("target", 0),
            "target_name": b.get("target_name", ""),
            "target_level": b.get("target_level") or b.get("level", 0),
            "lister_id": b.get("lister_id") or b.get("lister", 0),
            "lister_name": b.get("lister_name", ""),
            "reward": b.get("reward", 0),
            "reason": b.get("reason", ""),
            "quantity": b.get("quantity", 1),
        })

    bounties.sort(key=lambda b: b["reward"], reverse=True)
    total_value = sum(b["reward"] for b in bounties)

    # --- Threat scoring ---
    # 1. Get baseline (requesting player's stats) for relative scoring
    baseline = None
    baseline_spy = None
    threat_mode = "none"
    if x_player_id and key_store:
        user_key = key_store.get_key(x_player_id)
        if user_key:
            try:
                baseline = await torn_client.fetch_personalstats(user_key["api_key"])
                threat_mode = "relative"
            except Exception:
                pass
        if spy_service:
            baseline_spy = spy_service.repo.get_estimate(x_player_id)

    # 2. Batch-load spy estimates instead of N+1 per-target
    target_ids = [b["target_id"] for b in bounties]
    spy_data = {}
    if spy_service:
        all_est = {e["player_id"]: e for e in spy_service.repo.get_all_estimates()}
        for tid in target_ids:
            if tid in all_est:
                spy_data[tid] = all_est[tid]

    # 3. For top bounties without spy data, fetch personalstats + status (parallel)
    target_status = {}  # player_id -> status_state
    to_fetch = []
    bounty_map = {}  # tid -> bounty ref
    for b in bounties:
        tid = b["target_id"]
        if tid not in spy_data and len(to_fetch) < MAX_PROFILE_LOOKUPS:
            to_fetch.append(tid)
            bounty_map[tid] = b

    async def _fetch_profile(tid: int):
        return tid, await torn_client.fetch_user_profile_stats(tid)

    profile_results = await asyncio.gather(
        *[_fetch_profile(tid) for tid in to_fetch], return_exceptions=True
    )
    for result in profile_results:
        if isinstance(result, Exception):
            continue
        tid, profile = result
        if profile:
            ps_raw = profile.get("personalstats", {})
            b = bounty_map[tid]
            level = profile.get("level", 0) or b.get("target_level", 0)
            b["target_level"] = level
            target_status[tid] = profile.get("status_state", "")
            ps = PersonalStats.from_torn_api(ps_raw)
            est_data = estimate_stats(ps_raw, level, profile.get("age", 0))
            spy_data[tid] = {
                "total": est_data["estimated_total"],
                "confidence": est_data["confidence"],
                "source": "personalstats_estimate",
                "personalstats": ps,
            }

    # 4. Compute threat for each bounty
    for b in bounties:
        tid = b["target_id"]
        level = b.get("target_level", 0)

        if tid in spy_data:
            sd = spy_data[tid]
            # If we have real spy estimates (from DB) and baseline spy, use stat threat
            if baseline_spy and isinstance(sd, dict) and sd.get("total", 0) > 0 and "personalstats" not in sd:
                score, label = compute_stat_threat(sd, baseline_spy)
                b["threat_score"] = score
                b["threat_label"] = label
                b["threat_source"] = sd.get("source", "spy")
                b["estimated_total"] = sd.get("total", 0)
            elif "personalstats" in sd and baseline:
                # personalstats-based relative threat
                score, label = compute_threat(sd["personalstats"], level, baseline=baseline)
                b["threat_score"] = score
                b["threat_label"] = label
                b["threat_source"] = "estimated"
                b["estimated_total"] = sd.get("total", 0)
            elif "personalstats" in sd:
                # Absolute threat from personalstats
                score, label = compute_threat(sd["personalstats"], level)
                b["threat_score"] = score
                b["threat_label"] = label
                b["threat_source"] = "estimated"
                b["estimated_total"] = sd.get("total", 0)
            else:
                # Spy data without personalstats, absolute estimate
                b["threat_score"] = 50
                b["threat_label"] = "unknown"
                b["threat_source"] = "none"
                b["estimated_total"] = sd.get("total", 0)
        else:
            b["threat_score"] = 0
            b["threat_label"] = "unknown"
            b["threat_source"] = "none"
            b["estimated_total"] = None

        # Add target status (available/hospital/jail/etc)
        status = target_status.get(tid, "")
        b["target_status"] = status.lower() if status else "unknown"

    return {
        "bounties": bounties,
        "count": len(bounties),
        "total_value": total_value,
        "threat_mode": threat_mode,
    }
