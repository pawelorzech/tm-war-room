from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query

logger = logging.getLogger("tm-hub.company_director")

router = APIRouter(prefix="/api/company/director", tags=["company-director"])

torn_client = None  # Set by main.py
key_store = None  # Set by main.py
tornstats_key: str | None = None  # Set by main.py

_FACTION_PROFILE_CONCURRENCY = 5


def _require_services() -> None:
    if not torn_client or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")


async def _get_viewer_key(x_player_id: int) -> str:
    entry = key_store.get_key(x_player_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Register your API key first")
    return entry["api_key"]


@router.get("/me")
async def director_me(x_player_id: int = Header()) -> dict[str, Any]:
    """Full director cockpit for the viewer's own company.
    Returns {is_director: False} for non-directors (all director selections 403 → None)."""
    _require_services()
    api_key = await _get_viewer_key(x_player_id)

    # Fetch the personal training record to learn the viewer's company id + position.
    # This is already cached in TornClient.
    training = await torn_client.fetch_training_data(api_key)
    company_id = 0
    company_name = ""
    position = ""
    company_type = 0
    if training and isinstance(training.get("job"), dict):
        job = training["job"]
        company_id = job.get("company_id", 0) or 0
        company_name = job.get("company_name", "") or ""
        position = job.get("position", "") or ""
        company_type = job.get("company_type", 0) or 0

    # Kick off all director selections in parallel.
    detailed_task = asyncio.create_task(torn_client.fetch_company_detailed(api_key))
    employees_task = asyncio.create_task(torn_client.fetch_company_employees(api_key))
    applications_task = asyncio.create_task(torn_client.fetch_company_applications(api_key))
    stock_task = asyncio.create_task(torn_client.fetch_company_stock(api_key))
    profile_task = (
        asyncio.create_task(torn_client.fetch_company_profile(company_id, api_key))
        if company_id
        else None
    )

    detailed = await detailed_task
    employees = await employees_task
    applications = await applications_task
    stock = await stock_task
    profile = await profile_task if profile_task else None

    is_director = detailed is not None
    return {
        "is_director": is_director,
        "company_id": company_id,
        "company_name": company_name,
        "company_type": company_type,
        "position": position,
        "detailed": detailed,
        "employees": (employees or {}).get("company_employees") if employees else None,
        "applications": (applications or {}).get("applications") if applications else None,
        "stock": (stock or {}).get("company_stock") if stock else None,
        "profile": (profile or {}).get("company") if profile else None,
    }


@router.get("/news")
async def director_news(
    x_player_id: int = Header(),
    from_ts: int | None = Query(default=None, alias="from"),
    to_ts: int | None = Query(default=None, alias="to"),
    limit: int | None = Query(default=None, ge=1, le=100),
) -> dict[str, Any]:
    _require_services()
    api_key = await _get_viewer_key(x_player_id)
    raw = await torn_client.fetch_company_news(api_key, from_ts=from_ts, to_ts=to_ts, limit=limit)
    if raw is None:
        return {"is_director": False, "news": []}
    news = raw.get("news", {}) or {}
    entries = [
        {"id": int(k), "news": v.get("news", ""), "timestamp": v.get("timestamp", 0)}
        for k, v in news.items()
    ]
    entries.sort(key=lambda e: e["timestamp"], reverse=True)
    return {"is_director": True, "news": entries, "count": len(entries)}


@router.get("/faction")
async def director_faction(x_player_id: int = Header()) -> dict[str, Any]:
    """Public profiles for every company hosting a TM member.
    Works for non-directors too — benchmark view."""
    _require_services()
    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")

    all_keys = key_store.get_all_keys()

    # Map company_id -> {members: [...], company_name_from_job: str}
    members_by_company: dict[int, dict[str, Any]] = {}
    for kd in all_keys:
        try:
            training = await torn_client.fetch_training_data(kd["api_key"])
        except Exception as e:
            logger.warning("fetch_training_data failed for %s: %s", kd["player_id"], e)
            continue
        if not training or not isinstance(training.get("job"), dict):
            continue
        job = training["job"]
        cid = job.get("company_id", 0) or 0
        if not cid:
            continue
        entry = members_by_company.setdefault(
            cid,
            {
                "company_id": cid,
                "company_name": job.get("company_name", "Unknown"),
                "company_type": job.get("company_type", 0),
                "members": [],
            },
        )
        entry["members"].append(
            {
                "player_id": kd["player_id"],
                "player_name": kd.get("player_name") or f"#{kd['player_id']}",
                "position": job.get("position", "Unknown"),
            }
        )

    # Fetch public profile for each unique company, with limited concurrency.
    semaphore = asyncio.Semaphore(_FACTION_PROFILE_CONCURRENCY)
    viewer_key = (await _get_viewer_key(x_player_id))  # used as read key for public endpoint

    async def _fetch(cid: int) -> tuple[int, dict | None]:
        async with semaphore:
            result = await torn_client.fetch_company_profile(cid, viewer_key)
            return cid, result

    profiles = await asyncio.gather(*(_fetch(cid) for cid in members_by_company.keys()))
    for cid, raw_profile in profiles:
        if raw_profile and isinstance(raw_profile.get("company"), dict):
            members_by_company[cid]["profile"] = raw_profile["company"]
        else:
            members_by_company[cid]["profile"] = None

    companies = sorted(
        members_by_company.values(),
        key=lambda c: (c.get("profile") or {}).get("daily_income", 0),
        reverse=True,
    )
    return {"companies": companies, "count": len(companies)}
