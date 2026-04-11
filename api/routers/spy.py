from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Depends, Request
from pydantic import BaseModel
from api.services.spy import SpyService
from api.admin import require_admin

router = APIRouter(prefix="/api/spy", tags=["spy"])
spy_service: SpyService | None = None
torn_client = None  # Set by main.py
tornstats_key: str = ""  # Set by main.py


def _require_service() -> SpyService:
    if spy_service is None:
        raise HTTPException(status_code=503, detail="Spy service not initialized")
    return spy_service


def _fmt_estimate(est: dict, now: datetime) -> dict:
    reported = datetime.fromisoformat(est["reported_at"])
    if reported.tzinfo is None:
        reported = reported.replace(tzinfo=timezone.utc)
    return {
        "player_id": est["player_id"], "player_name": est["player_name"],
        "strength": est["strength"], "defense": est["defense"],
        "speed": est["speed"], "dexterity": est["dexterity"],
        "total": est["total"], "confidence": est["confidence"],
        "source": est["source"], "reported_at": est["reported_at"],
        "age_days": (now - reported).days,
    }


class SpySubmitBody(BaseModel):
    player_id: int
    strength: float
    defense: float
    speed: float
    dexterity: float


# --- Public endpoints ---

@router.get("/search")
async def search_by_name(q: str, svc: SpyService = Depends(_require_service)):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query required")
    all_estimates = svc.repo.get_all_estimates()
    hidden = svc.repo.get_hidden_ids()
    query_lower = q.strip().lower()
    matches = [e for e in all_estimates
               if e.get("player_name") and query_lower in e["player_name"].lower()
               and e["player_id"] not in hidden]
    if not matches:
        raise HTTPException(status_code=404, detail=f"No known players matching '{q.strip()}'")
    now = datetime.now(timezone.utc)
    results = [_fmt_estimate(e, now) for e in matches[:20]]
    results.sort(key=lambda r: r["total"], reverse=True)
    return results[0]


@router.get("/known")
async def list_known_estimates(svc: SpyService = Depends(_require_service)):
    estimates = svc.repo.get_all_estimates()
    hidden = svc.repo.get_hidden_ids()
    now = datetime.now(timezone.utc)
    result = [_fmt_estimate(e, now) for e in estimates if e["player_id"] not in hidden]
    return {"estimates": result, "count": len(result)}


@router.get("/faction/{faction_id}")
async def spy_faction(faction_id: int, svc: SpyService = Depends(_require_service)):
    if not torn_client:
        raise HTTPException(status_code=503, detail="Torn client not initialized")
    members, faction_info = await asyncio.gather(
        torn_client.fetch_enemy_members(faction_id),
        torn_client.fetch_faction_info(faction_id),
    )
    now = datetime.now(timezone.utc)
    blocked_ids = {r["player_id"] for r in svc.repo.get_blocked()}

    # Batch-load all known estimates instead of N+1 per-member queries
    all_estimates = {e["player_id"]: e for e in svc.repo.get_all_estimates()}

    # Collect members needing TornStats lookup
    to_lookup = [m for m in members if m.id not in blocked_ids
                 and m.id not in all_estimates and tornstats_key][:20]

    # Parallel TornStats lookups
    async def _ts_lookup(m):
        return m, await torn_client.fetch_tornstats_spy_user(m.id, tornstats_key)
    ts_results = await asyncio.gather(*[_ts_lookup(m) for m in to_lookup], return_exceptions=True)
    for result in ts_results:
        if isinstance(result, Exception):
            continue
        m, ts_data = result
        if ts_data and ts_data.get("total", 0) > 0:
            svc.repo.upsert_report(
                player_id=m.id, player_name=ts_data.get("player_name") or m.name,
                source="tornstats", strength=ts_data["strength"], defense=ts_data["defense"],
                speed=ts_data["speed"], dexterity=ts_data["dexterity"], total=ts_data["total"],
                confidence="estimate", reported_at=now.isoformat(),
            )
            svc.refresh_estimate(m.id)
            all_estimates[m.id] = svc.repo.get_estimate(m.id)

    results = []
    for m in members:
        if m.id in blocked_ids:
            continue
        est = all_estimates.get(m.id)
        if est:
            entry = _fmt_estimate(est, now)
            entry["player_name"] = entry["player_name"] or m.name
            entry["level"] = m.level
            results.append(entry)
        else:
            results.append({
                "player_id": m.id, "player_name": m.name,
                "strength": 0, "defense": 0, "speed": 0, "dexterity": 0,
                "total": 0, "confidence": "unknown",
                "source": "none", "reported_at": None, "age_days": None,
                "level": m.level,
            })
    results.sort(key=lambda r: r["total"], reverse=True)
    return {
        "faction": faction_info.model_dump() if faction_info else None,
        "members": results,
        "known_count": sum(1 for r in results if r["confidence"] != "unknown"),
        "total_count": len(results),
    }


@router.get("/{player_id}")
async def get_spy_estimate(player_id: int, svc: SpyService = Depends(_require_service)):
    if svc.repo.is_blocked(player_id):
        raise HTTPException(status_code=403, detail="This player is blocked from spy lookups")
    est = svc.repo.get_estimate(player_id)
    if not est and torn_client and tornstats_key:
        ts_data = await torn_client.fetch_tornstats_spy_user(player_id, tornstats_key)
        if ts_data and ts_data.get("total", 0) > 0:
            now = datetime.now(timezone.utc).isoformat()
            svc.repo.upsert_report(
                player_id=player_id, player_name=ts_data.get("player_name"),
                source="tornstats", strength=ts_data["strength"], defense=ts_data["defense"],
                speed=ts_data["speed"], dexterity=ts_data["dexterity"], total=ts_data["total"],
                confidence="estimate", reported_at=now,
            )
            svc.refresh_estimate(player_id)
            est = svc.repo.get_estimate(player_id)
    if not est:
        # Fallback: try personalstats-based estimation
        if torn_client:
            try:
                ps = await torn_client.fetch_personalstats(torn_client._api_key)
                # We can only estimate for players we can fetch personalstats for
                # For now, just return 404 — estimation needs the target's personalstats
                pass
            except Exception:
                pass
        raise HTTPException(status_code=404, detail="No spy data available for this player")
    result = _fmt_estimate(est, datetime.now(timezone.utc))
    # Add stat estimate from personalstats if available
    if torn_client and result.get("confidence") in ("estimate", "unknown"):
        try:
            from api.stat_estimator import estimate_stats
            resp = await torn_client._http.get(
                "https://api.torn.com/user/",
                params={"selections": "personalstats,profile", "key": torn_client._api_key, "id": player_id},
            )
            if resp.status_code == 200:
                from api.torn_client import _json
                raw = await _json(resp)
                ps_raw = raw.get("personalstats", {})
                level = raw.get("level", 0)
                age = raw.get("age", 0)
                est_data = estimate_stats(ps_raw, level, age)
                result["stat_estimate"] = est_data
        except Exception:
            pass
    return result


@router.post("/submit")
async def submit_spy(body: SpySubmitBody, x_player_id: int = Header(), svc: SpyService = Depends(_require_service)):
    if svc.repo.is_blocked(body.player_id):
        raise HTTPException(status_code=403, detail="This player is blocked from spy lookups")
    total = body.strength + body.defense + body.speed + body.dexterity
    now = datetime.now(timezone.utc).isoformat()
    svc.repo.upsert_report(
        player_id=body.player_id, player_name=None, source="member_submit",
        strength=body.strength, defense=body.defense, speed=body.speed,
        dexterity=body.dexterity, total=total, confidence="exact", reported_at=now,
    )
    svc.refresh_estimate(body.player_id)
    return {"status": "ok", "player_id": body.player_id}


# --- Admin endpoints ---

@router.delete("/admin/{player_id}")
async def admin_delete_spy(player_id: int, admin: dict = Depends(require_admin), svc: SpyService = Depends(_require_service)):
    deleted = svc.repo.delete_estimate(player_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Player not found in spy database")
    return {"status": "ok", "deleted_player_id": player_id}


class BlockBody(BaseModel):
    reason: str | None = None

@router.post("/admin/block/{player_id}")
async def admin_block_player(player_id: int, body: BlockBody, admin: dict = Depends(require_admin), svc: SpyService = Depends(_require_service)):
    svc.repo.block_player(player_id, blocked_by=admin["sub"], reason=body.reason)
    return {"status": "ok", "blocked_player_id": player_id}

@router.delete("/admin/block/{player_id}")
async def admin_unblock_player(player_id: int, admin: dict = Depends(require_admin), svc: SpyService = Depends(_require_service)):
    removed = svc.repo.unblock_player(player_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Player not in block list")
    return {"status": "ok", "unblocked_player_id": player_id}

@router.get("/admin/blocked")
async def admin_list_blocked(admin: dict = Depends(require_admin), svc: SpyService = Depends(_require_service)):
    return {"blocked": svc.repo.get_blocked()}


@router.post("/admin/hide/{player_id}")
async def admin_hide_player(player_id: int, admin: dict = Depends(require_admin), svc: SpyService = Depends(_require_service)):
    svc.repo.hide_player(player_id, hidden_by=admin["sub"])
    return {"status": "ok", "hidden_player_id": player_id}

@router.delete("/admin/hide/{player_id}")
async def admin_unhide_player(player_id: int, admin: dict = Depends(require_admin), svc: SpyService = Depends(_require_service)):
    removed = svc.repo.unhide_player(player_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Player not in hidden list")
    return {"status": "ok", "unhidden_player_id": player_id}

@router.get("/admin/hidden")
async def admin_list_hidden(admin: dict = Depends(require_admin), svc: SpyService = Depends(_require_service)):
    return {"hidden": svc.repo.get_hidden()}
