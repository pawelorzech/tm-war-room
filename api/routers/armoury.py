from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from api.config import SUPERADMIN_ID
from api.armoury import VALID_CATEGORIES, CATEGORY_TO_ITEMS

logger = logging.getLogger("tm-hub.armoury")

router = APIRouter(prefix="/api/armoury", tags=["armoury"])
torn_client = None
key_store = None
repo = None


class CreateCompetition(BaseModel):
    name: str
    categories: list[str] = []
    items: list[str] = []
    start_ts: int
    end_ts: int | None = None
    prize_text: str | None = None


@router.get("/competitions")
async def list_competitions(x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    competitions = repo.get_all_competitions()
    return {"competitions": competitions, "count": len(competitions)}


@router.get("/competitions/{comp_id}/leaderboard")
async def get_leaderboard(comp_id: int, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    comp = repo.get_competition(comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    rows = repo.get_leaderboard(comp_id)
    leaderboard = []
    for i, r in enumerate(rows, 1):
        leaderboard.append({
            "rank": i,
            "player_id": r["player_id"],
            "player_name": r["player_name"],
            "total": r["total"],
            "deposits": r["deposits"],
            "last_deposit": r["last_deposit"],
        })
    total_deposited = sum(r["total"] for r in leaderboard)
    return {
        "competition": comp,
        "leaderboard": leaderboard,
        "total_deposited": total_deposited,
        "participants": len(leaderboard),
    }


@router.post("/competitions")
async def create_competition(body: CreateCompetition, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    if not body.categories and not body.items:
        raise HTTPException(status_code=400, detail="At least one category or item is required")
    for cat in body.categories:
        if cat not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category '{cat}'. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
    if body.end_ts is not None and body.end_ts <= body.start_ts:
        raise HTTPException(status_code=400, detail="end_ts must be after start_ts")
    category_str = ",".join(sorted(set(body.categories))) if body.categories else ""
    items_str = ",".join(body.items) if body.items else None
    comp_id = repo.create_competition(
        name=body.name,
        category=category_str,
        start_ts=body.start_ts,
        end_ts=body.end_ts or 0,
        created_by=x_player_id,
        prize_text=body.prize_text,
        items=items_str,
    )
    # Auto-poll to pick up existing deposits for the new competition
    try:
        from api.scheduler.jobs.armoury_poll import run_armoury_poll
        await run_armoury_poll()
    except Exception as e:
        logger.warning("Auto-poll after competition creation failed: %s", e)
    return {"id": comp_id, "status": "created"}


@router.post("/competitions/{comp_id}/end")
async def end_competition(comp_id: int, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    comp = repo.get_competition(comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    repo.end_competition(comp_id)
    return {"status": "ended"}


class UpdateCompetition(BaseModel):
    name: str | None = None
    categories: list[str] | None = None
    items: list[str] | None = None
    start_ts: int | None = None
    end_ts: int | None = None
    prize_text: str | None = None


@router.delete("/competitions/{comp_id}")
async def delete_competition(comp_id: int, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    comp = repo.get_competition(comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    repo.delete_competition(comp_id)
    return {"status": "deleted"}


@router.put("/competitions/{comp_id}")
async def update_competition(comp_id: int, body: UpdateCompetition, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    comp = repo.get_competition(comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if body.categories is not None:
        for cat in body.categories:
            if cat not in VALID_CATEGORIES:
                raise HTTPException(status_code=400, detail=f"Invalid category '{cat}'. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        updates["category"] = ",".join(sorted(set(body.categories))) if body.categories else ""
        del updates["categories"]
    if body.items is not None:
        updates["items"] = ",".join(body.items) if body.items else None
    repo.update_competition(comp_id, **updates)
    return {"status": "updated", "updated_fields": list(updates.keys())}


@router.post("/poll")
async def trigger_poll(x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    from api.scheduler.jobs.armoury_poll import run_armoury_poll
    await run_armoury_poll()
    return {"status": "polled"}


@router.get("/competitions/{comp_id}/debug")
async def debug_competition(comp_id: int, x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if x_player_id != SUPERADMIN_ID and not key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    comp = repo.get_competition(comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    deposits = repo.get_deposits(comp_id)
    last_poll_ts = repo.get_last_poll_ts(comp_id)
    # Group deposits by player for quick overview
    by_player: dict[int, dict] = {}
    for d in deposits:
        pid = d["player_id"]
        if pid not in by_player:
            by_player[pid] = {"name": d["player_name"], "items": [], "total_qty": 0}
        by_player[pid]["items"].append({"item": d["item_name"], "qty": d["quantity"], "ts": d["deposited_at"], "news_id": d["news_id"]})
        by_player[pid]["total_qty"] += d["quantity"]
    return {
        "competition": comp,
        "last_poll_ts": last_poll_ts,
        "total_deposits": len(deposits),
        "unique_players": len(by_player),
        "by_player": by_player,
        "raw_deposits": deposits,
    }


@router.get("/items/search")
async def search_items(q: str = "", x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if len(q) < 2:
        return {"items": []}
    from api.routers.market import ensure_items_cache
    cache = await ensure_items_cache(torn_client)
    if not cache:
        return {"items": []}
    q_lower = q.lower()
    matches = [
        {"id": item["id"], "name": item["name"], "type": item["type"]}
        for item in cache
        if q_lower in item["name"].lower()
    ][:20]
    return {"items": matches}


@router.get("/categories")
async def list_categories(x_player_id: int = Header()):
    if not key_store or not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    return {
        "categories": {
            cat: items for cat, items in sorted(CATEGORY_TO_ITEMS.items())
        }
    }
