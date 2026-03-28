from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from api.db.repos.stats import StatSnapshotRepository

router = APIRouter(prefix="/api/stats", tags=["stats"])
stats_repo: StatSnapshotRepository | None = None  # Set by main.py


@router.get("/snapshots/{player_id}")
async def get_snapshots(player_id: int, limit: int = Query(default=365, ge=1, le=3650)):
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
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
        raise HTTPException(status_code=404, detail="No stat snapshots for this player")
    return growth


@router.get("/leaderboard")
async def get_leaderboard():
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    latest = stats_repo.get_all_latest()
    return {"members": latest, "count": len(latest)}
