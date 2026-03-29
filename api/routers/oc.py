from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger("tm-hub.oc")

router = APIRouter(prefix="/api/oc", tags=["oc"])
torn_client = None  # Set by main.py


async def _get_member_names() -> dict[int, str]:
    """Build player_id → name lookup from faction members."""
    if not torn_client:
        return {}
    try:
        members = await torn_client.fetch_members()
        return {m.id: m.name for m in members}
    except Exception:
        return {}


@router.get("")
async def oc_overview(cat: str = Query(default="planning")):
    """Get organized crimes data. cat: planning, completed, executing."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    if cat not in ("planning", "completed", "executing"):
        cat = "planning"

    crimes = await torn_client.fetch_faction_crimes(cat=cat)
    name_lookup = await _get_member_names()

    parsed = []
    for c in crimes:
        if not isinstance(c, dict):
            continue


        participants = []
        slots = c.get("slots", c.get("participants", []))
        if isinstance(slots, dict):
            slots = list(slots.values())
        for s in (slots if isinstance(slots, list) else []):
            if isinstance(s, dict):
                user = s.get("user") or s
                pid = user.get("id") or s.get("player_id") or s.get("id", 0)
                pname = user.get("name") or s.get("player_name") or s.get("name", "")
                # Fallback to member lookup
                if not pname and pid:
                    pname = name_lookup.get(pid, "")
                participants.append({
                    "player_id": pid,
                    "player_name": pname or f"#{pid}",
                    "role": s.get("role") or s.get("position", ""),
                    "checkpoint_pass_rate": s.get("checkpoint_pass_rate") or s.get("cpr", 0),
                    "planning_complete": s.get("planning_complete", False),
                })

        # Parse success — API may use bool, string, int, or nested result
        raw_success = c.get("success")
        if raw_success is None:
            # Try alternative field names
            raw_success = c.get("result") or c.get("outcome")
        # Status field "Successful"/"Failed" can also indicate success
        status_str = str(c.get("status", "")).lower()
        if raw_success is None and status_str in ("successful", "success"):
            raw_success = True
        elif raw_success is None and status_str in ("failed", "failure"):
            raw_success = False

        if isinstance(raw_success, str):
            success = raw_success.lower() in ("success", "successful", "true", "1", "yes")
        elif isinstance(raw_success, (int, float)):
            success = bool(raw_success)
        elif isinstance(raw_success, bool):
            success = raw_success
        else:
            success = None

        # Parse rewards — API may nest under "reward" or use different names
        reward = c.get("reward") or {}
        money_gain = c.get("money_gain", 0) or reward.get("money", 0) or c.get("cash_gain", 0) or 0
        respect_gain = c.get("respect_gain", 0) or reward.get("respect", 0) or 0

        parsed.append({
            "id": c.get("id", 0),
            "name": c.get("name") or c.get("crime_name", "Unknown Crime"),
            "status": c.get("status", cat),
            "difficulty": c.get("difficulty", ""),
            "initiated_at": c.get("initiated_at") or c.get("planning_at", 0),
            "executed_at": c.get("executed_at", 0),
            "ready_at": c.get("ready_at", 0),
            "success": success,
            "money_gain": money_gain,
            "respect_gain": respect_gain,
            "participants": participants,
            "participant_count": len(participants),
        })

    return {
        "crimes": parsed,
        "count": len(parsed),
        "category": cat,
    }
