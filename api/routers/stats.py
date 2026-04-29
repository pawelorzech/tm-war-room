from __future__ import annotations
import logging
from datetime import date
from fastapi import APIRouter, HTTPException, Query, Header
from api.config import SUPERADMIN_IDS
from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository

logger = logging.getLogger("tm-hub.routes.stats")

router = APIRouter(prefix="/api/stats", tags=["stats"])
stats_repo: StatSnapshotRepository | None = None  # Set by main.py
key_repo: KeyRepository | None = None  # Set by main.py
torn_client = None  # Set by main.py


async def _ensure_snapshot(player_id: int) -> bool:
    """If no snapshot exists for this player, fetch and store one now. Returns True if data exists."""
    if not stats_repo or not key_repo or not torn_client:
        return False
    existing = stats_repo.get_latest_snapshot(player_id)
    if existing:
        return True
    # Try to fetch live data
    user_key = key_repo.get_key(player_id)
    if not user_key:
        return False
    try:
        data = await torn_client.fetch_training_data(user_key["api_key"])
        if not data:
            return False
        bs = data["battlestats"]
        ps = data.get("personalstats", {})
        total = bs["strength"] + bs["defense"] + bs["speed"] + bs["dexterity"]
        # Fetch extended stats
        from api.scheduler.jobs.collect_stats import _fetch_extended_personalstats
        ext_ps = await _fetch_extended_personalstats(torn_client, user_key["api_key"])
        gym_energy = sum(ps.get(k, 0) or 0 for k in ("gymstrength", "gymdefense", "gymspeed", "gymdexterity"))
        stats_repo.insert_snapshot(
            player_id=player_id, snapshot_date=date.today().isoformat(),
            strength=bs["strength"], defense=bs["defense"],
            speed=bs["speed"], dexterity=bs["dexterity"], total=total,
            level=data.get("level"),
            xanax_taken=ps.get("xantaken"),
            refills=ps.get("refills"),
            networth=ps.get("networth"),
            stat_enhancers_used=ext_ps.get("statenhancersused") or ps.get("statenhancersused"),
            easter_eggs=ext_ps.get("eastereggs"),
            gym_energy=gym_energy or None,
        )
        return True
    except Exception:
        return False


def _require_self_or_admin(player_id: int, x_player_id: int) -> None:
    if player_id == x_player_id:
        return
    # Superadmins (config SUPERADMIN_IDS) bypass the DB admin flag — same pattern
    # as api/admin.py uses for break-glass access.
    if x_player_id in SUPERADMIN_IDS:
        return
    if key_repo and key_repo.is_admin(x_player_id):
        return
    raise HTTPException(status_code=403, detail="You can only view your own stat snapshots")


@router.get("/snapshots/{player_id}")
async def get_snapshots(
    player_id: int,
    limit: int = Query(default=365, ge=1, le=3650),
    x_player_id: int = Header(),
):
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    _require_self_or_admin(player_id, x_player_id)
    snaps = stats_repo.get_snapshots(player_id, limit=limit)
    live_fetched = False
    if not snaps:
        await _ensure_snapshot(player_id)
        snaps = stats_repo.get_snapshots(player_id, limit=limit)
        live_fetched = True
    if not snaps:
        logger.info("snapshots player=%d count=0 limit=%d live_fetch=%s -> 404", player_id, limit, live_fetched)
        raise HTTPException(status_code=404, detail="No stat snapshots for this player")
    logger.info(
        "snapshots player=%d count=%d limit=%d live_fetch=%s newest=%s",
        player_id, len(snaps), limit, live_fetched, snaps[-1].get("snapshot_date"),
    )
    return {"player_id": player_id, "snapshots": snaps, "count": len(snaps)}


@router.get("/growth/{player_id}")
async def get_growth(
    player_id: int,
    days: int = Query(default=30, ge=1, le=365),
    x_player_id: int = Header(),
):
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    _require_self_or_admin(player_id, x_player_id)
    growth = stats_repo.get_growth(player_id, days=days)
    if not growth:
        await _ensure_snapshot(player_id)
        growth = stats_repo.get_growth(player_id, days=days)
    if not growth:
        logger.info("growth player=%d days=%d -> 404 (no snapshots)", player_id, days)
        raise HTTPException(status_code=404, detail="No stat snapshots for this player")
    logger.info(
        "growth player=%d days=%d baseline=%s latest=%s actual_days=%d",
        player_id, days, growth.get("from_date"), growth.get("to_date"), growth.get("days", 0),
    )
    return growth


@router.get("/leaderboard")
async def get_leaderboard():
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    latest = stats_repo.get_all_latest()
    # If empty, try collecting for all registered members now
    if not latest and key_repo and torn_client:
        logger.warning(
            "leaderboard: stat_snapshots is empty — triggering ad-hoc collect_stat_snapshots. "
            "This usually means the scheduler isn't running (check leader election)."
        )
        from api.scheduler.jobs.collect_stats import collect_stat_snapshots
        await collect_stat_snapshots(key_repo, stats_repo, torn_client)
        latest = stats_repo.get_all_latest()
    # Enrich with player names from faction members
    name_lookup: dict[int, str] = {}
    if torn_client:
        try:
            members = await torn_client.fetch_members()
            name_lookup = {m.id: m.name for m in members}
        except Exception:
            pass
    for entry in latest:
        pid = entry.get("player_id", 0)
        if pid and pid in name_lookup:
            entry["player_name"] = name_lookup[pid]
    return {"members": latest, "count": len(latest)}


@router.get("/growth-leaderboard")
async def get_growth_leaderboard(days: int = Query(default=30, ge=1, le=365)):
    """Stat growth leaderboard — ranked by total growth over period, includes % growth."""
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    rows = stats_repo.get_all_growth(days=days)
    # Get latest snapshots for absolute values (easter eggs etc)
    latest_snaps = {s["player_id"]: s for s in stats_repo.get_all_latest()}
    # Enrich with player names
    name_lookup: dict[int, str] = {}
    if torn_client:
        try:
            members = await torn_client.fetch_members()
            name_lookup = {m.id: m.name for m in members}
        except Exception:
            pass
    result = []
    for r in rows:
        pid = r["player_id"]
        start_total = r.get("start_total") or 0
        total_growth = r.get("total_growth") or 0
        actual_days = max(1, (date.fromisoformat(r["to_date"]) - date.fromisoformat(r["from_date"])).days)
        pct_growth = (total_growth / start_total * 100) if start_total > 0 else 0
        xanax_d = r.get("xanax_delta") or 0
        refills_d = r.get("refills_delta") or 0
        edrinks_d = r.get("energy_drinks_delta") or 0
        # Use real gym energy from Torn personalstats when available
        end_gym = r.get("end_gym_energy")
        start_gym = r.get("start_gym_energy")
        if end_gym is not None and start_gym is not None:
            energy_spent = end_gym - start_gym
        else:
            energy_spent = None
        result.append({
            "player_id": pid,
            "player_name": name_lookup.get(pid, f"#{pid}"),
            "from_date": r["from_date"],
            "to_date": r["to_date"],
            "days": actual_days,
            "str_growth": r.get("str_growth", 0),
            "def_growth": r.get("def_growth", 0),
            "spd_growth": r.get("spd_growth", 0),
            "dex_growth": r.get("dex_growth", 0),
            "total_growth": total_growth,
            "pct_growth": round(pct_growth, 2),
            "per_day": round(total_growth / actual_days, 0) if actual_days > 0 else 0,
            "xanax_delta": xanax_d if xanax_d else None,
            "refills_delta": refills_d if refills_d else None,
            "energy_drinks_delta": edrinks_d if edrinks_d else None,
            "se_delta": r.get("se_delta"),
            "energy_spent": energy_spent,
            "easter_eggs_delta": r.get("easter_eggs_delta"),
            "easter_eggs_total": latest_snaps.get(pid, {}).get("easter_eggs"),
        })
    return {"members": result, "days": days, "count": len(result)}
