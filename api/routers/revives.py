from __future__ import annotations
import logging
from collections import defaultdict
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("tm-hub.revives")

router = APIRouter(prefix="/api/revives", tags=["revives"])
torn_client = None  # Set by main.py


@router.get("")
async def revive_report():
    """Get faction revive data with per-member stats."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    revives = await torn_client.fetch_faction_revives()

    # Parse revives
    parsed = []
    member_stats: dict[int, dict] = defaultdict(lambda: {
        "reviver_id": 0, "reviver_name": "", "revives_given": 0,
        "revives_received": 0, "successes": 0, "failures": 0,
    })

    for r in revives:
        reviver = r.get("reviver") or r
        target = r.get("target") or r
        reviver_id = reviver.get("id") or r.get("reviver_id", 0)
        reviver_name = reviver.get("name") or r.get("reviver_name", "")
        target_id = target.get("id") or r.get("target_id", 0)
        target_name = target.get("name") or r.get("target_name", "")
        result = r.get("result", "success")
        timestamp = r.get("timestamp", 0)

        parsed.append({
            "reviver_id": reviver_id,
            "reviver_name": reviver_name,
            "target_id": target_id,
            "target_name": target_name,
            "result": result,
            "chance": r.get("chance", 0),
            "timestamp": timestamp,
        })

        if reviver_id:
            s = member_stats[reviver_id]
            s["reviver_id"] = reviver_id
            s["reviver_name"] = reviver_name or s["reviver_name"]
            s["revives_given"] += 1
            if result == "success":
                s["successes"] += 1
            else:
                s["failures"] += 1

        if target_id:
            s = member_stats[target_id]
            s["reviver_id"] = target_id
            s["reviver_name"] = target_name or s["reviver_name"]
            s["revives_received"] += 1

    # Sort by most given
    members = sorted(member_stats.values(), key=lambda m: m["revives_given"], reverse=True)
    # Sort parsed by newest first
    parsed.sort(key=lambda r: r["timestamp"], reverse=True)

    return {
        "revives": parsed[:200],
        "members": members,
        "total_revives": len(parsed),
        "total_success": sum(1 for r in parsed if r["result"] == "success"),
        "total_fail": sum(1 for r in parsed if r["result"] != "success"),
    }
