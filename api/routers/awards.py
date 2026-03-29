from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header

logger = logging.getLogger("tm-hub.awards")

router = APIRouter(prefix="/api/awards", tags=["awards"])
torn_client = None  # Set by main.py
key_store = None  # Set by main.py


@router.get("/catalog")
async def honor_catalog():
    """Get all available honors and medals definitions (cached 1h)."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    catalog = await torn_client.fetch_honor_catalog()
    honors = catalog.get("honors", {})
    medals = catalog.get("medals", {})
    return {
        "honors": honors,
        "medals": medals,
        "honor_count": len(honors),
        "medal_count": len(medals),
    }


@router.get("/detail/{kind}/{award_id}")
async def award_detail(kind: str, award_id: int, x_player_id: int = Header(default=0)):
    """Get detail for a single honor or medal, including player's earned status."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    if kind not in ("honor", "medal"):
        raise HTTPException(status_code=400, detail="kind must be 'honor' or 'medal'")

    catalog = await torn_client.fetch_honor_catalog()
    section = "honors" if kind == "honor" else "medals"
    all_items = catalog.get(section, {})
    item = all_items.get(str(award_id))
    if not item:
        raise HTTPException(status_code=404, detail=f"{kind} #{award_id} not found")

    result = {
        "id": award_id,
        "kind": kind,
        "name": item.get("name", ""),
        "description": item.get("description", ""),
        "type": item.get("type", 0),
        "rarity": item.get("rarity", ""),
        "circulation": item.get("circulation", 0),
        "earned": False,
        "earned_at": None,
    }

    # Check if player has earned it
    if x_player_id and key_store:
        all_keys = key_store.get_all_keys()
        user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
        if user_key:
            try:
                user_data = await torn_client.fetch_user_honors(user_key["api_key"])
                awarded_key = "honors_awarded" if kind == "honor" else "medals_awarded"
                time_key = "honors_time" if kind == "honor" else "medals_time"
                awarded_list = user_data.get(awarded_key, [])
                time_list = user_data.get(time_key, [])
                if award_id in awarded_list:
                    result["earned"] = True
                    idx = awarded_list.index(award_id)
                    if idx < len(time_list):
                        result["earned_at"] = time_list[idx]
            except Exception:
                pass

    return result


@router.get("/me")
async def my_awards(x_player_id: int = Header()):
    """Get current player's awarded honors and medals."""
    if not torn_client or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")

    all_keys = key_store.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    if not user_key:
        raise HTTPException(status_code=401, detail="Register your API key first")
    api_key = user_key["api_key"]

    user_data = await torn_client.fetch_user_honors(api_key)
    catalog = await torn_client.fetch_honor_catalog()

    honors_awarded = set(user_data.get("honors_awarded", []))
    medals_awarded = set(user_data.get("medals_awarded", []))
    honors_time = user_data.get("honors_time", [])
    medals_time = user_data.get("medals_time", [])

    all_honors = catalog.get("honors", {})
    all_medals = catalog.get("medals", {})

    honors_awarded_list = user_data.get("honors_awarded", [])
    honor_time_map = {}
    for i, hid in enumerate(honors_awarded_list):
        if i < len(honors_time):
            honor_time_map[hid] = honors_time[i]

    medals_awarded_list = user_data.get("medals_awarded", [])
    medal_time_map = {}
    for i, mid in enumerate(medals_awarded_list):
        if i < len(medals_time):
            medal_time_map[mid] = medals_time[i]

    honors = []
    for hid_str, h in all_honors.items():
        hid = int(hid_str)
        honors.append({
            "id": hid,
            "name": h.get("name", ""),
            "description": h.get("description", ""),
            "type": h.get("type", 0),
            "rarity": h.get("rarity", ""),
            "circulation": h.get("circulation", 0),
            "earned": hid in honors_awarded,
            "earned_at": honor_time_map.get(hid),
        })

    medals = []
    for mid_str, m in all_medals.items():
        mid = int(mid_str)
        medals.append({
            "id": mid,
            "name": m.get("name", ""),
            "description": m.get("description", ""),
            "type": m.get("type", 0),
            "circulation": m.get("circulation", 0),
            "earned": mid in medals_awarded,
            "earned_at": medal_time_map.get(mid),
        })

    return {
        "player_id": user_data.get("player_id"),
        "name": user_data.get("name"),
        "honors": honors,
        "medals": medals,
        "honors_earned": len(honors_awarded),
        "honors_total": len(all_honors),
        "medals_earned": len(medals_awarded),
        "medals_total": len(all_medals),
    }
