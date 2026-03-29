from __future__ import annotations
from datetime import date
from fastapi import APIRouter, HTTPException, Query, Header
from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository

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
    all_keys = key_repo.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == player_id), None)
    if not user_key:
        return False
    try:
        data = await torn_client.fetch_training_data(user_key["api_key"])
        if not data:
            return False
        bs = data["battlestats"]
        ps = data.get("personalstats", {})
        total = bs["strength"] + bs["defense"] + bs["speed"] + bs["dexterity"]
        stats_repo.insert_snapshot(
            player_id=player_id, snapshot_date=date.today().isoformat(),
            strength=bs["strength"], defense=bs["defense"],
            speed=bs["speed"], dexterity=bs["dexterity"], total=total,
            level=data.get("level"),
            xanax_taken=ps.get("xantaken"),
            refills=ps.get("refills"),
            networth=ps.get("networth"),
        )
        return True
    except Exception:
        return False


@router.get("/snapshots/{player_id}")
async def get_snapshots(player_id: int, limit: int = Query(default=365, ge=1, le=3650)):
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    snaps = stats_repo.get_snapshots(player_id, limit=limit)
    if not snaps:
        await _ensure_snapshot(player_id)
        snaps = stats_repo.get_snapshots(player_id, limit=limit)
    if not snaps:
        raise HTTPException(status_code=404, detail="No stat snapshots for this player")
    return {"player_id": player_id, "snapshots": snaps, "count": len(snaps)}


@router.get("/growth/{player_id}")
async def get_growth(player_id: int, days: int = Query(default=30, ge=1, le=365)):
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    growth = stats_repo.get_growth(player_id, days=days)
    if not growth:
        await _ensure_snapshot(player_id)
        growth = stats_repo.get_growth(player_id, days=days)
    if not growth:
        raise HTTPException(status_code=404, detail="No stat snapshots for this player")
    return growth


@router.get("/leaderboard")
async def get_leaderboard():
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    latest = stats_repo.get_all_latest()
    # If empty, try collecting for all registered members now
    if not latest and key_repo and torn_client:
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
