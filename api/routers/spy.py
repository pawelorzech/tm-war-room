from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Depends, Request
from pydantic import BaseModel
from api.services.spy import SpyService, is_real_spy, spy_reported_at
from api.torn_client import TornStatsAuthError
from api.admin import require_admin

router = APIRouter(prefix="/api/spy", tags=["spy"])
spy_service: SpyService | None = None
torn_client = None  # Set by main.py
tornstats_key: str = ""  # Set by main.py — global fallback key from TORNSTATS_API_KEY env
key_store = None  # Set by main.py — KeyStore for per-user TornStats keys
stats_repo = None  # Set by main.py — StatSnapshotRepository for faction-member fallback


async def _try_tornstats_pool(player_id: int, caller_id: int | None) -> dict | None:
    """Try TornStats /spy/user/{id} across a key pool, return first real spy.

    Order matters:
      1. Caller's own TornStats key — best signal that this user can see the
         target (their faction may have spied it personally).
      2. Other members' valid keys — round-robin over the pool. Different
         keys see different faction-spy entries, so the union covers more
         XIDs than any one key alone.
      3. Global TORNSTATS_API_KEY from env — baseline fallback.

    Keys that return 401/403 are marked status='invalid' in member_keys so
    we stop wasting requests on them. The next time the owner re-sets their
    key in Settings, it gets a fresh 'ok' status.
    """
    if not torn_client:
        return None
    tried: set[str] = set()
    candidates: list[tuple[int | None, str]] = []

    if caller_id and key_store:
        my_key = key_store.get_tornstats_key(caller_id)
        if my_key and my_key not in tried:
            candidates.append((caller_id, my_key))
            tried.add(my_key)

    if key_store:
        for pid, k in key_store.get_all_valid_tornstats_keys():
            if k not in tried:
                candidates.append((pid, k))
                tried.add(k)

    if tornstats_key and tornstats_key not in tried:
        candidates.append((None, tornstats_key))

    for owner_pid, k in candidates:
        try:
            result = await torn_client.fetch_tornstats_spy_user(player_id, k)
        except TornStatsAuthError:
            if owner_pid is not None and key_store:
                key_store.mark_tornstats_key_status(owner_pid, "invalid")
            continue
        if result and is_real_spy(result):
            return result
    return None


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


# After this many days an existing estimate triggers an on-demand TornStats refresh
# when the user actually views the player. Matches refresh_stale_spies job threshold.
STALE_REFRESH_DAYS = 7


def _is_stale(est: dict, now: datetime, max_age_days: int = STALE_REFRESH_DAYS) -> bool:
    reported = datetime.fromisoformat(est["reported_at"])
    if reported.tzinfo is None:
        reported = reported.replace(tzinfo=timezone.utc)
    return (now - reported).days > max_age_days


async def _build_fallback_estimate(player_id: int, svc: SpyService) -> dict | None:
    """Return a synthesized SpyEstimate when no spy network has data.

    Preference order:
    1. ``stat_snapshots`` (the player's own API key, exact) — only available
       for TM Hub-registered teammates, but it's the most accurate source we
       can ever get.
    2. Our heuristic estimator over ``personalstats`` (xanax / refills / etc.).
       Works for any player but is a coarse single-number guess.

    Not persisted to spy_estimates — these are derived views over data we
    already store. Persisting would duplicate and risk drift.
    """
    now = datetime.now(timezone.utc)

    # 1. faction_snapshot — exact stats from the player's own API key
    if stats_repo:
        snap = stats_repo.get_latest_snapshot(player_id)
        if snap and (snap.get("total") or 0) > 0:
            snap_date = snap["snapshot_date"]  # "YYYY-MM-DD"
            reported = datetime.fromisoformat(snap_date + "T00:00:00+00:00")
            age_days = max(0, (now - reported).days)
            # The snapshot itself is exact — but it ages. After EXACT_MAX_AGE_DAYS
            # we step down to "estimate" so the UI shows a reasonable confidence.
            confidence = "exact" if age_days <= 7 else ("estimate" if age_days <= 30 else "stale")
            name = svc.repo.get_names_for_ids([player_id]).get(player_id)
            return {
                "player_id": player_id,
                "player_name": name,
                "strength": snap["strength"],
                "defense": snap["defense"],
                "speed": snap["speed"],
                "dexterity": snap["dexterity"],
                "total": snap["total"],
                "confidence": confidence,
                "source": "faction_snapshot",
                "reported_at": reported.isoformat(),
                "age_days": age_days,
            }

    # 2. Heuristic estimator from personalstats (xanax + refills + level + ...)
    if torn_client is None:
        return None
    try:
        from api.stat_estimator import estimate_stats
        from api.torn_client import _json
        # Torn API v1 takes the target user id in the URL path, not as `?id=`.
        # A query-string `id` is silently ignored and the response holds the
        # API key OWNER's stats — which is why the heuristic estimate used to
        # show the owner's totals (e.g. 7.02B split 1.76B/stat) for every
        # player who lacked a TornStats/YATA spy.
        resp = await torn_client._http.get(
            f"https://api.torn.com/user/{player_id}",
            params={
                "selections": "personalstats,profile",
                "key": torn_client._api_key,
            },
        )
        if resp.status_code != 200:
            return None
        raw = await _json(resp)
        ps_raw = raw.get("personalstats", {})
        level = raw.get("level", 0)
        age = raw.get("age", 0)
        est_data = estimate_stats(ps_raw, level, age)
        total = int(est_data.get("estimated_total") or 0)
        if total <= 0:
            return None
        per_stat = total // 4
        name = raw.get("name") or svc.repo.get_names_for_ids([player_id]).get(player_id)
        return {
            "player_id": player_id,
            "player_name": name,
            # We can't split the heuristic total across the four stats, so we
            # divide evenly. The UI should show this with low confidence so
            # users know the per-stat breakdown is a guess.
            "strength": per_stat,
            "defense": per_stat,
            "speed": per_stat,
            "dexterity": per_stat,
            "total": total,
            "confidence": "estimate",
            "source": "estimated",
            "reported_at": now.isoformat(),
            "age_days": 0,
            "stat_estimate": est_data,
        }
    except Exception:
        return None


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
    # Skip placeholder rows (total<=0) — they hold no actionable stat info,
    # and rendering them as "0/0/0/0" misleads the UI.
    visible = [
        e for e in estimates
        if e["player_id"] not in hidden and (e.get("total") or 0) > 0
    ]
    missing_ids = [e["player_id"] for e in visible if not (e.get("player_name") or "").strip()]
    name_overrides = svc.repo.get_names_for_ids(missing_ids) if missing_ids else {}
    result = []
    for e in visible:
        entry = _fmt_estimate(e, now)
        if not (entry.get("player_name") or "").strip():
            override = name_overrides.get(e["player_id"])
            if override:
                entry["player_name"] = override
        result.append(entry)
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

    # Batch-load estimates only for this faction's members (not entire table)
    member_ids = [m.id for m in members if m.id not in blocked_ids]
    all_estimates = svc.repo.get_estimates_bulk(member_ids)

    # Collect members needing TornStats lookup — either no estimate yet, or stale (>7d).
    # Capped at 20 to keep the request fast; remaining stale rows get caught by
    # the refresh_stale_spies scheduler job (every 6h).
    to_lookup = [
        m for m in members
        if m.id not in blocked_ids and tornstats_key
        and (m.id not in all_estimates or _is_stale(all_estimates[m.id], now))
    ][:20]

    # Parallel TornStats + YATA lookups per member. Both spy networks are
    # consulted because TornStats can hold a year-old spy while YATA has a
    # recent one (or vice versa); refresh_estimate picks whichever report
    # has the most recent actual spy timestamp.
    async def _lookup(m):
        ts_task = torn_client.fetch_tornstats_spy_user(m.id, tornstats_key)
        yata_task = torn_client.fetch_yata_spy_user(m.id)
        ts_data, yata_data = await asyncio.gather(ts_task, yata_task, return_exceptions=True)
        return m, ts_data, yata_data
    results_raw = await asyncio.gather(*[_lookup(m) for m in to_lookup], return_exceptions=True)
    now_iso = now.isoformat()
    for result in results_raw:
        if isinstance(result, Exception):
            continue
        m, ts_data, yata_data = result
        touched = False
        if not isinstance(ts_data, Exception) and is_real_spy(ts_data):
            svc.repo.upsert_report(
                player_id=m.id, player_name=ts_data.get("player_name") or m.name,
                source="tornstats", strength=ts_data["strength"], defense=ts_data["defense"],
                speed=ts_data["speed"], dexterity=ts_data["dexterity"], total=ts_data["total"],
                confidence="estimate",
                reported_at=spy_reported_at(ts_data.get("timestamp"), now_iso),
            )
            touched = True
        if not isinstance(yata_data, Exception) and is_real_spy(yata_data):
            svc.repo.upsert_report(
                player_id=m.id, player_name=yata_data.get("player_name") or m.name,
                source="yata", strength=yata_data["strength"], defense=yata_data["defense"],
                speed=yata_data["speed"], dexterity=yata_data["dexterity"], total=yata_data["total"],
                confidence="estimate",
                reported_at=spy_reported_at(yata_data.get("timestamp"), now_iso),
            )
            touched = True
        if touched:
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
async def get_spy_estimate(
    player_id: int,
    x_player_id: int | None = Header(None),
    svc: SpyService = Depends(_require_service),
):
    if svc.repo.is_blocked(player_id):
        raise HTTPException(status_code=403, detail="This player is blocked from spy lookups")
    est = svc.repo.get_estimate(player_id)
    # A row with total<=0 is just a placeholder — no real spy data. Treat it as missing
    # so the on-demand TornStats fetch below has a chance to fill it in (instead of
    # returning 0/0/0/0 to the UI, which is meaningless to the user).
    if est and (est.get("total") or 0) <= 0:
        est = None
    now_dt = datetime.now(timezone.utc)
    needs_refresh = (not est) or _is_stale(est, now_dt)
    if needs_refresh and torn_client:
        # TornStats via per-user key pool (caller → other members → global env),
        # in parallel with YATA. The pool is what gives /api/spy/{id} parity with
        # the native TornStats userscript: each user's own key sees faction-spy
        # entries scoped to that user's TornStats account, so the union covers
        # more XIDs than any single key alone.
        ts_task = _try_tornstats_pool(player_id, x_player_id)
        yata_task = torn_client.fetch_yata_spy_user(player_id)
        ts_data, yata_data = await asyncio.gather(ts_task, yata_task, return_exceptions=True)
        now_iso = datetime.now(timezone.utc).isoformat()
        touched = False
        for source, data in (("tornstats", ts_data), ("yata", yata_data)):
            if isinstance(data, Exception) or not is_real_spy(data):
                continue
            svc.repo.upsert_report(
                player_id=player_id, player_name=data.get("player_name"),
                source=source, strength=data["strength"], defense=data["defense"],
                speed=data["speed"], dexterity=data["dexterity"], total=data["total"],
                confidence="estimate",
                reported_at=spy_reported_at(data.get("timestamp"), now_iso),
            )
            touched = True
        if touched:
            svc.refresh_estimate(player_id)
            est = svc.repo.get_estimate(player_id)
    if not est:
        # Faction-member fallback: TornStats and YATA almost never have spy data
        # on our own teammates (you don't spy your own faction), so a teammate
        # would show "no spy estimate available" forever. If the player has
        # registered an API key with TM Hub we have their EXACT stats in
        # stat_snapshots — much better than any external estimate.
        fallback = await _build_fallback_estimate(player_id, svc)
        if fallback:
            return fallback
        raise HTTPException(status_code=404, detail="No spy data available for this player")
    result = _fmt_estimate(est, datetime.now(timezone.utc))
    if not (result.get("player_name") or "").strip():
        override = svc.repo.get_names_for_ids([player_id]).get(player_id)
        if override:
            result["player_name"] = override
    # Add stat estimate from personalstats if available
    if torn_client and result.get("confidence") in ("estimate", "unknown"):
        try:
            from api.stat_estimator import estimate_stats
            # See _build_fallback_estimate: `id` must be in the URL path; a
            # query-string id is ignored and returns the key owner's data.
            resp = await torn_client._http.get(
                f"https://api.torn.com/user/{player_id}",
                params={"selections": "personalstats,profile", "key": torn_client._api_key},
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
