from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("tm-hub.bounties")

router = APIRouter(prefix="/api/bounties", tags=["bounties"])
torn_client = None  # Set by main.py


@router.get("")
async def list_bounties():
    """Get available bounties."""
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
            "lister_id": b.get("lister_id") or b.get("lister", 0),
            "lister_name": b.get("lister_name", ""),
            "reward": b.get("reward", 0),
            "reason": b.get("reason", ""),
            "quantity": b.get("quantity", 1),
        })

    bounties.sort(key=lambda b: b["reward"], reverse=True)
    total_value = sum(b["reward"] for b in bounties)
    return {"bounties": bounties, "count": len(bounties), "total_value": total_value}
