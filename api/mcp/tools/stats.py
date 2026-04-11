from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def stat_leaderboard() -> str:
        """Faction stat leaderboard: latest battle stats snapshot for every member, sorted by total."""
        stats_repo = get_service("stats_repo")
        latest = stats_repo.get_all_latest()
        return json.dumps(latest, indent=2, default=str)

    @mcp.tool()
    def stat_growth(days: int = 30) -> str:
        """Stat growth for all faction members over the last N days.

        Args:
            days: Number of days to measure growth over (default 30).
        """
        stats_repo = get_service("stats_repo")
        growth = stats_repo.get_all_growth(days)
        return json.dumps(growth, indent=2, default=str)

    @mcp.tool()
    def player_stats(player_id: int, limit: int = 30) -> str:
        """Historical stat snapshots for a specific player.

        Args:
            player_id: Torn player ID.
            limit: Max number of snapshots to return (default 30).
        """
        stats_repo = get_service("stats_repo")
        snapshots = stats_repo.get_snapshots(player_id, limit)
        return json.dumps(snapshots, indent=2, default=str)
