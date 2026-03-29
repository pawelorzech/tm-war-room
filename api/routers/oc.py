from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger("tm-hub.oc")

router = APIRouter(prefix="/api/oc", tags=["oc"])
torn_client = None  # Set by main.py


@router.get("")
async def oc_overview(cat: str = Query(default="planning")):
    """Get organized crimes data. cat: planning, completed, executing."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    if cat not in ("planning", "completed", "executing"):
        cat = "planning"

    crimes = await torn_client.fetch_faction_crimes(cat=cat)

    # Log first crime structure for debugging
    if crimes:
        first = crimes[0] if isinstance(crimes, list) else next(iter(crimes.values()), None) if isinstance(crimes, dict) else None
        if first and isinstance(first, dict):
            logger.info("OC crime keys: %s, slots keys: %s", list(first.keys())[:10],
                         list((first.get("slots") or first.get("participants") or {}).keys())[:3] if isinstance(first.get("slots") or first.get("participants"), dict) else "list/none")

    # Parse and normalize crime data
    parsed = []
    for c in crimes:
        if not isinstance(c, dict):
            continue

        # Extract participants
        participants = []
        slots = c.get("slots", c.get("participants", []))
        if isinstance(slots, dict):
            slots = list(slots.values())
        for s in (slots if isinstance(slots, list) else []):
            if isinstance(s, dict):
                user = s.get("user") or s
                participants.append({
                    "player_id": user.get("id") or s.get("player_id") or s.get("id", 0),
                    "player_name": user.get("name") or s.get("player_name") or s.get("name", ""),
                    "role": s.get("role") or s.get("position", ""),
                    "checkpoint_pass_rate": s.get("checkpoint_pass_rate") or s.get("cpr", 0),
                    "planning_complete": s.get("planning_complete", False),
                })

        parsed.append({
            "id": c.get("id", 0),
            "name": c.get("name") or c.get("crime_name", "Unknown Crime"),
            "status": c.get("status", cat),
            "difficulty": c.get("difficulty", ""),
            "initiated_at": c.get("initiated_at") or c.get("planning_at", 0),
            "executed_at": c.get("executed_at", 0),
            "ready_at": c.get("ready_at", 0),
            "success": c.get("success"),
            "money_gain": c.get("money_gain", 0),
            "respect_gain": c.get("respect_gain", 0),
            "participants": participants,
            "participant_count": len(participants),
        })

    return {
        "crimes": parsed,
        "count": len(parsed),
        "category": cat,
    }
