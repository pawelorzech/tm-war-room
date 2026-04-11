from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def list_stakeouts() -> str:
        """List all active stakeouts with player status and last activity."""
        stakeout_repo = get_service("stakeout_repo")
        stakeouts = stakeout_repo.get_all()
        return json.dumps(stakeouts, indent=2, default=str)

    @mcp.tool()
    def add_stakeout(player_id: int, player_name: str = "", notes: str = "") -> str:
        """Add a player to the stakeout watch list.

        Args:
            player_id: Torn player ID to watch.
            player_name: Player name (optional, for display).
            notes: Reason or notes for the stakeout (optional).
        """
        from api.config import SUPERADMIN_ID

        stakeout_repo = get_service("stakeout_repo")
        stakeout_repo.add(player_id, player_name or None, SUPERADMIN_ID, notes)
        return json.dumps(
            {"player_id": player_id, "status": "added"},
            indent=2,
        )
