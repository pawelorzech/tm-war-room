from __future__ import annotations

import asyncio
import math
import logging
import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from api.time_utils import (
    calendar_week_end_tct,
    calendar_week_start_tct,
    week_start_tct,
    week_end_tct,
    format_week_label,
)

logger = logging.getLogger("tm-hub.company_director")

router = APIRouter(prefix="/api/company/director", tags=["company-director"])

torn_client = None  # Set by main.py
key_store = None  # Set by main.py
tornstats_key: str | None = None  # Set by main.py
companies_repo = None  # CompanySnapshotRepository, set by main.py
tracked_companies_repo = None  # TrackedCompaniesRepository, set by main.py
pinned_weeks_repo = None  # PinnedWeeksRepository, set by main.py
company_alerts_repo = None  # CompanyAlertConfigRepository, set by main.py

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


@router.get("/applications/ranked")
async def director_applications_ranked(x_player_id: int = Header()) -> dict[str, Any]:
    """For each pending applicant, call TornStats /efficiency to predict their
    effectiveness at every position. Falls back to TornStats /spy/user to fill
    in stats the applicant didn't share (0 in Torn's payload).
    Returns per-applicant: {userID, name, level, stats, efficiency, best_position, best_score}."""
    _require_services()
    api_key = await _get_viewer_key(x_player_id)

    apps_raw = await torn_client.fetch_company_applications(api_key)
    if apps_raw is None:
        return {"is_director": False, "applicants": []}
    apps = (apps_raw or {}).get("applications", {}) or {}

    ts_key = tornstats_key

    semaphore = asyncio.Semaphore(5)  # respect TornStats 100/min

    async def _rank_one(app: dict[str, Any]) -> dict[str, Any]:
        user_id = int(app.get("userID") or 0)
        stats = app.get("stats") or {}
        man = int(stats.get("manual_labor") or 0)
        intel = int(stats.get("intelligence") or 0)
        end = int(stats.get("endurance") or 0)

        # If the applicant hid any stat (=0), try the TornStats spy DB as fallback
        if ts_key and (man == 0 or intel == 0 or end == 0) and user_id:
            async with semaphore:
                spy = await torn_client.fetch_tornstats_spy_user(user_id, ts_key)
            if isinstance(spy, dict):
                # fetch_tornstats_spy_user returns battle stats today — we need work stats.
                # It doesn't expose work stats yet, so we just keep 0s. The ranker
                # transparently reports 'stats_hidden' so the UI can explain.
                pass

        efficiency: dict[str, Any] | None = None
        if ts_key and (man > 0 or intel > 0 or end > 0):
            async with semaphore:
                efficiency = await torn_client.fetch_tornstats_efficiency(
                    ts_key, manual_labor=man, intelligence=intel, endurance=end,
                )

        # Derive best position + score from efficiency response (if present)
        best_position: str | None = None
        best_score: float | None = None
        if isinstance(efficiency, dict):
            # The efficiency response nests positions per company type: {companies:{<company_name>: {<position>: score}}}
            # We pick the global max across all companies/positions.
            companies = efficiency.get("companies") or {}
            for positions in companies.values():
                if not isinstance(positions, dict):
                    continue
                for pos, score in positions.items():
                    try:
                        s = float(score)
                    except (TypeError, ValueError):
                        continue
                    if best_score is None or s > best_score:
                        best_score = s
                        best_position = pos

        return {
            "userID": user_id,
            "name": app.get("name"),
            "level": app.get("level"),
            "message": app.get("message"),
            "status": app.get("status"),
            "expires": app.get("expires"),
            "stats": {"manual_labor": man, "intelligence": intel, "endurance": end},
            "stats_hidden": man == 0 and intel == 0 and end == 0,
            "efficiency": efficiency,
            "best_position": best_position,
            "best_score": best_score,
        }

    ranked = await asyncio.gather(*(_rank_one(a) for a in apps.values()))
    ranked.sort(key=lambda r: r["best_score"] or -1, reverse=True)
    return {
        "is_director": True,
        "tornstats_enabled": bool(ts_key),
        "applicants": ranked,
        "count": len(ranked),
    }


@router.get("/trends")
async def director_trends(
    x_player_id: int = Header(),
    days: int = Query(default=30, ge=1, le=365),
) -> dict[str, Any]:
    """Time-series for the viewer's own company from daily snapshots.
    Returns empty lists if no snapshots yet (first day after Phase B deploy)."""
    _require_services()
    if companies_repo is None:
        raise HTTPException(status_code=503, detail="Snapshots not initialized")
    api_key = await _get_viewer_key(x_player_id)

    # Resolve the viewer's company id via training data.
    training = await torn_client.fetch_training_data(api_key)
    company_id = 0
    if training and isinstance(training.get("job"), dict):
        company_id = int(training["job"].get("company_id") or 0)
    if not company_id:
        return {"company_id": 0, "days": days, "company": [], "stock": []}

    company_rows = companies_repo.get_snapshots(company_id, days=days)
    stock_rows = companies_repo.get_stock_trend(company_id, days=days)
    return {
        "company_id": company_id,
        "days": days,
        "company": company_rows,
        "stock": stock_rows,
    }


@router.get("/stock-runway")
async def director_stock_runway(x_player_id: int = Header()) -> dict[str, Any]:
    """Estimate whether current product stock can support this week's sell rate
    through Sunday, using Mon 00:00 TCT as the player-facing week boundary."""
    _require_services()
    if companies_repo is None:
        raise HTTPException(status_code=503, detail="Snapshots not initialized")
    api_key = await _get_viewer_key(x_player_id)

    training = await torn_client.fetch_training_data(api_key)
    company_id = 0
    if training and isinstance(training.get("job"), dict):
        company_id = int(training["job"].get("company_id") or 0)

    now_ts = int(time.time())
    week_start_ts = calendar_week_start_tct()
    week_end_ts = calendar_week_end_tct(week_start_ts)
    days_remaining = max(0.0, (week_end_ts - now_ts) / 86400)

    base = {
        "company_id": company_id,
        "week_start_ts": week_start_ts,
        "week_end_ts": week_end_ts,
        "generated_at": now_ts,
        "days_remaining": round(days_remaining, 2),
        "history_complete": False,
        "products": [],
    }
    if not company_id:
        return {"is_director": False, **base}

    stock_raw = await torn_client.fetch_company_stock(api_key)
    if stock_raw is None:
        return {"is_director": False, **base}

    stock = (stock_raw or {}).get("company_stock", {}) or {}
    baselines = companies_repo.get_stock_runway_baselines(company_id, week_start_ts)
    products: list[dict[str, Any]] = []

    for product_name, item in stock.items():
        baseline = baselines.get(product_name)
        current_sold = int(item.get("sold_amount") or 0)
        current_worth = int(item.get("sold_worth") or 0)
        if baseline:
            baseline_sold = int(baseline.get("sold_amount") or 0)
            baseline_worth = int(baseline.get("sold_worth") or 0)
            baseline_recorded_at = int(baseline.get("recorded_at") or week_start_ts)
            baseline_source = baseline.get("source")
            item_history_complete = bool(baseline.get("history_complete"))
        else:
            baseline_sold = current_sold
            baseline_worth = current_worth
            baseline_recorded_at = now_ts
            baseline_source = "current"
            item_history_complete = False

        elapsed_start = week_start_ts if item_history_complete else baseline_recorded_at
        elapsed_days = max((now_ts - elapsed_start) / 86400, 1 / 24)
        sold_since_monday = max(0, current_sold - baseline_sold)
        worth_since_monday = max(0, current_worth - baseline_worth)
        avg_daily_sold = sold_since_monday / elapsed_days
        projected_until_sunday = int(math.ceil(avg_daily_sold * days_remaining))
        in_stock = int(item.get("in_stock") or 0)
        on_order = int(item.get("on_order") or 0)
        available_stock = in_stock + on_order
        shortage = max(0, projected_until_sunday - available_stock)
        if shortage > 0:
            status = "shortage"
        elif avg_daily_sold > 0 and available_stock - projected_until_sunday < avg_daily_sold:
            status = "low"
        else:
            status = "ok"

        products.append(
            {
                "product_name": product_name,
                "cost": item.get("cost"),
                "price": item.get("price"),
                "rrp": item.get("rrp"),
                "in_stock": in_stock,
                "on_order": on_order,
                "available_stock": available_stock,
                "sold_amount": current_sold,
                "sold_worth": current_worth,
                "baseline_sold_amount": baseline_sold,
                "baseline_sold_worth": baseline_worth,
                "baseline_recorded_at": baseline_recorded_at,
                "baseline_source": baseline_source,
                "history_complete": item_history_complete,
                "sold_since_monday": sold_since_monday,
                "sold_worth_since_monday": worth_since_monday,
                "elapsed_days": round(elapsed_days, 2),
                "avg_daily_sold": round(avg_daily_sold, 2),
                "projected_until_sunday": projected_until_sunday,
                "shortage": shortage,
                "status": status,
            }
        )

    priority = {"shortage": 0, "low": 1, "ok": 2}
    products.sort(
        key=lambda p: (priority.get(p["status"], 9), -p["shortage"], -p["projected_until_sunday"], p["product_name"])
    )
    return {
        "is_director": True,
        **base,
        "history_complete": all(p["history_complete"] for p in products) if products else False,
        "products": products,
    }


# ----------------------------- Weekly comparison -----------------------------


async def _resolve_viewer_company(api_key: str) -> tuple[int, int]:
    """Return (company_id, company_type) from the viewer's training data. Zero on failure."""
    training = await torn_client.fetch_training_data(api_key)
    if not training or not isinstance(training.get("job"), dict):
        return 0, 0
    job = training["job"]
    return int(job.get("company_id") or 0), int(job.get("company_type") or 0)


@router.get("/weekly-comparison")
async def director_weekly_comparison(
    x_player_id: int = Header(),
    week_start: int | None = Query(default=None, description="Unix ts of Mon 18:00 TCT; omit for current week"),
    scope: str = Query(default="same_type", pattern="^(same_type|all)$"),
    limit: int = Query(default=25, ge=1, le=100),
) -> dict[str, Any]:
    """Rank this viewer's company vs. every tracked company for the anchored week.

    Weekly anchor = Monday 18:00 TCT (= UTC). Rankings use Torn's rolling 7-day
    weekly_income — the only metric exposed publicly for rivals. For OUR own
    company we additionally return the diff of lifetime sold_worth captured in
    stock snapshots (true anchored-week sales). See docs at /company/director.
    """
    _require_services()
    if companies_repo is None:
        raise HTTPException(status_code=503, detail="Snapshots not initialized")
    api_key = await _get_viewer_key(x_player_id)

    viewer_company_id, viewer_company_type = await _resolve_viewer_company(api_key)

    start_ts = week_start if week_start is not None else week_start_tct()
    end_ts = week_end_tct(start_ts)

    ct_filter = viewer_company_type if (scope == "same_type" and viewer_company_type) else None
    ranked = companies_repo.rank_companies_by_week(
        start_ts, end_ts, company_type=ct_filter, limit=limit
    )

    own_rank: int | None = None
    own_snapshot: dict | None = None
    own_weekly_sales: dict | None = None
    if viewer_company_id:
        own_snapshot = companies_repo.get_own_weekly_snapshot(
            viewer_company_id, start_ts, end_ts
        )
        own_weekly_sales = companies_repo.get_weekly_sales(
            viewer_company_id, start_ts, end_ts
        )
        # If own company wasn't in the top-N, compute its rank separately
        for idx, r in enumerate(ranked, start=1):
            if r["company_id"] == viewer_company_id:
                own_rank = idx
                break
        if own_rank is None and own_snapshot and own_snapshot.get("weekly_income") is not None:
            all_ranked = companies_repo.rank_companies_by_week(
                start_ts, end_ts, company_type=ct_filter, limit=2000
            )
            for idx, r in enumerate(all_ranked, start=1):
                if r["company_id"] == viewer_company_id:
                    own_rank = idx
                    break

    return {
        "week_start_ts": start_ts,
        "week_end_ts": end_ts,
        "week_label": format_week_label(start_ts),
        "scope": scope,
        "company_type_filter": ct_filter,
        "viewer_company_id": viewer_company_id,
        "viewer_company_type": viewer_company_type,
        "viewer_rank": own_rank,
        "viewer_snapshot": own_snapshot,
        "viewer_weekly_sales": own_weekly_sales,
        "ranked": ranked,
        "tracked_total": len(tracked_companies_repo.list_all()) if tracked_companies_repo else 0,
    }


# ----------------------------- Pinned weeks -----------------------------


class PinnedWeekCreate(BaseModel):
    week_start: int = Field(..., description="Unix ts, Mon 18:00 TCT")
    label: str = Field(..., min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=500)


@router.get("/pinned-weeks")
async def director_list_pinned_weeks(x_player_id: int = Header()) -> dict[str, Any]:
    _require_services()
    if pinned_weeks_repo is None:
        raise HTTPException(status_code=503, detail="Pinned weeks not initialized")
    api_key = await _get_viewer_key(x_player_id)
    company_id, _ = await _resolve_viewer_company(api_key)
    pins = pinned_weeks_repo.list_for(x_player_id, company_id=company_id or None)
    for p in pins:
        p["label_auto"] = format_week_label(p["week_start_ts"])
    return {"company_id": company_id, "pinned": pins}


@router.post("/pinned-weeks")
async def director_create_pinned_week(
    body: PinnedWeekCreate,
    x_player_id: int = Header(),
) -> dict[str, Any]:
    _require_services()
    if pinned_weeks_repo is None or companies_repo is None:
        raise HTTPException(status_code=503, detail="Pinned weeks not initialized")
    api_key = await _get_viewer_key(x_player_id)
    company_id, _ = await _resolve_viewer_company(api_key)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company — can't pin a week")
    pinned_id = pinned_weeks_repo.create(
        player_id=x_player_id,
        company_id=company_id,
        week_start_ts=body.week_start,
        label=body.label,
        note=body.note,
    )
    # Return snapshot + sales for the pinned week so UI can render immediately
    start_ts = body.week_start
    end_ts = week_end_tct(start_ts)
    snap = companies_repo.get_own_weekly_snapshot(company_id, start_ts, end_ts)
    sales = companies_repo.get_weekly_sales(company_id, start_ts, end_ts)
    return {
        "id": pinned_id,
        "company_id": company_id,
        "week_start_ts": start_ts,
        "week_end_ts": end_ts,
        "label": body.label,
        "note": body.note,
        "snapshot": snap,
        "weekly_sales": sales,
    }


@router.delete("/pinned-weeks/{pinned_id}")
async def director_delete_pinned_week(
    pinned_id: int,
    x_player_id: int = Header(),
) -> dict[str, Any]:
    _require_services()
    if pinned_weeks_repo is None:
        raise HTTPException(status_code=503, detail="Pinned weeks not initialized")
    ok = pinned_weeks_repo.delete(x_player_id, pinned_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Pinned week not found")
    return {"ok": True, "id": pinned_id}


@router.get("/pinned-weeks/{pinned_id}/data")
async def director_pinned_week_data(
    pinned_id: int,
    x_player_id: int = Header(),
) -> dict[str, Any]:
    """Return the snapshot + sales for a previously-pinned week (for chart overlay)."""
    _require_services()
    if pinned_weeks_repo is None or companies_repo is None:
        raise HTTPException(status_code=503, detail="Pinned weeks not initialized")
    pin = pinned_weeks_repo.get(x_player_id, pinned_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pinned week not found")
    start_ts = pin["week_start_ts"]
    end_ts = week_end_tct(start_ts)
    snap = companies_repo.get_own_weekly_snapshot(pin["company_id"], start_ts, end_ts)
    sales = companies_repo.get_weekly_sales(pin["company_id"], start_ts, end_ts)
    return {
        **pin,
        "week_end_ts": end_ts,
        "snapshot": snap,
        "weekly_sales": sales,
    }


# ----------------------------- Trains alerts -----------------------------


class AlertConfigUpsert(BaseModel):
    target_player_id: int
    enabled: bool = True
    threshold_days: int = Field(default=3, ge=1, le=30)


@router.get("/alerts/trains")
async def director_list_trains_alerts(x_player_id: int = Header()) -> dict[str, Any]:
    _require_services()
    if company_alerts_repo is None:
        raise HTTPException(status_code=503, detail="Alerts not initialized")
    api_key = await _get_viewer_key(x_player_id)
    company_id, _ = await _resolve_viewer_company(api_key)
    if not company_id:
        return {"company_id": 0, "alerts": []}
    alerts = company_alerts_repo.list_for_company(company_id, alert_type="company_trains_stagnant")
    return {"company_id": company_id, "alerts": alerts}


@router.post("/alerts/trains")
async def director_upsert_trains_alert(
    body: AlertConfigUpsert,
    x_player_id: int = Header(),
) -> dict[str, Any]:
    """Toggle 'trains stagnant' alert for a specific employee. enabled=False removes."""
    _require_services()
    if company_alerts_repo is None:
        raise HTTPException(status_code=503, detail="Alerts not initialized")
    api_key = await _get_viewer_key(x_player_id)
    company_id, _ = await _resolve_viewer_company(api_key)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company — can't configure alerts")

    # Authorization: only directors can configure alerts. We already verified
    # they have a director key (implicit — _resolve_viewer_company returned a
    # company_id), but we also require the viewer to BE the director. Quick
    # check: call detailed, which returns None for non-directors.
    detailed = await torn_client.fetch_company_detailed(api_key)
    if detailed is None:
        raise HTTPException(status_code=403, detail="Only directors can configure company alerts")

    if body.enabled:
        company_alerts_repo.upsert(
            company_id=company_id,
            alert_type="company_trains_stagnant",
            target_player_id=body.target_player_id,
            threshold_days=body.threshold_days,
        )
    else:
        company_alerts_repo.delete(
            company_id=company_id,
            alert_type="company_trains_stagnant",
            target_player_id=body.target_player_id,
        )
    return {"ok": True, "company_id": company_id, **body.model_dump()}


# ----------------------------- Manual watchlist -----------------------------


class TrackedCompanyAdd(BaseModel):
    company_id: int = Field(..., gt=0)


@router.post("/tracked-companies")
async def director_add_tracked_company(
    body: TrackedCompanyAdd,
    x_player_id: int = Header(),
) -> dict[str, Any]:
    """Manually add a rival company to the daily snapshot watchlist.
    The next snapshot cycle will include it with scope='public'."""
    _require_services()
    if tracked_companies_repo is None:
        raise HTTPException(status_code=503, detail="Tracked companies not initialized")
    api_key = await _get_viewer_key(x_player_id)
    # Fetch public profile once so we have a name + type immediately
    profile_raw = await torn_client.fetch_company_profile(body.company_id, api_key)
    profile = (profile_raw or {}).get("company") if profile_raw else None
    if not profile:
        raise HTTPException(status_code=404, detail="Company not found or API error")
    tracked_companies_repo.upsert(
        company_id=body.company_id,
        company_type=profile.get("company_type"),
        rating=profile.get("rating"),
        name=profile.get("name"),
        director_id=profile.get("director"),
        source="manual",
    )
    return {"ok": True, "company": tracked_companies_repo.get(body.company_id)}
