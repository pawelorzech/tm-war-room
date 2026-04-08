from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header

logger = logging.getLogger("tm-hub.company")

router = APIRouter(prefix="/api/company", tags=["company"])
torn_client = None  # Set by main.py
key_store = None    # Set by main.py


@router.get("/catalog")
async def company_catalog():
    """Get all company types with specials, positions, stock."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    raw = await torn_client.fetch_company_catalog()
    companies = []
    for cid, c in sorted(raw.items(), key=lambda x: int(x[0])):
        companies.append({
            "id": int(cid),
            "name": c.get("name", f"Company {cid}"),
            "cost": c.get("cost", 0),
            "default_employees": c.get("default_employees", 0),
            "positions": list(c.get("positions", {}).values()) if isinstance(c.get("positions"), dict) else (c.get("positions") or []),
            "stock": list(c.get("stock", {}).values()) if isinstance(c.get("stock"), dict) else (c.get("stock") or []),
            "specials": list(c.get("specials", {}).values()) if isinstance(c.get("specials"), dict) else (c.get("specials") or []),
        })
    return {"companies": companies, "count": len(companies)}


@router.get("/faction")
async def company_faction(x_player_id: int = Header()):
    """Get faction members grouped by their companies."""
    if not torn_client or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")

    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")

    all_keys = key_store.get_all_keys()
    members_by_company: dict[int, dict] = {}

    for kd in all_keys:
        try:
            training = await torn_client.fetch_training_data(kd["api_key"])
            if not training or "job" not in training:
                continue
            job = training["job"]
            cid = job.get("company_id", 0)
            if not cid:
                continue
            if cid not in members_by_company:
                members_by_company[cid] = {
                    "company_id": cid,
                    "company_name": job.get("company_name", "Unknown"),
                    "company_type": job.get("company_type", 0),
                    "members": [],
                }
            members_by_company[cid]["members"].append({
                "player_id": kd["player_id"],
                "player_name": kd.get("player_name", f"#{kd['player_id']}"),
                "position": job.get("position", "Unknown"),
            })
        except Exception as e:
            logger.warning("Failed to fetch job data for %s: %s", kd["player_id"], e)

    companies = sorted(members_by_company.values(), key=lambda c: len(c["members"]), reverse=True)
    return {"companies": companies, "count": len(companies)}
