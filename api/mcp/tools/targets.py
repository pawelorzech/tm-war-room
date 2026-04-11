from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def list_targets(tag: str = "") -> str:
        """List faction targets, optionally filtered by tag.

        Args:
            tag: Filter by tag (empty string returns all targets).
        """
        target_repo = get_service("target_repo")
        if tag:
            targets = target_repo.get_by_tag(tag)
        else:
            targets = target_repo.get_all()
        return json.dumps(targets, indent=2, default=str)

    @mcp.tool()
    def add_target(
        player_id: int,
        player_name: str = "",
        tag: str = "",
        notes: str = "",
        difficulty: str = "",
    ) -> str:
        """Add a player to the faction target list (as superadmin Bombel).

        Args:
            player_id: Torn player ID.
            player_name: Player name (optional).
            tag: Category tag (e.g. 'war', 'chain', 'retal').
            notes: Free-text notes about the target.
            difficulty: Difficulty rating (e.g. 'easy', 'medium', 'hard', 'unknown').
        """
        from api.config import SUPERADMIN_ID

        target_repo = get_service("target_repo")
        row_id = target_repo.add_target(
            player_id=player_id,
            player_name=player_name or None,
            added_by=SUPERADMIN_ID,
            added_by_name="Bombel",
            tag=tag,
            notes=notes,
            difficulty=difficulty or "unknown",
        )
        return json.dumps(
            {"player_id": player_id, "row_id": row_id, "status": "added"},
            indent=2,
        )

    @mcp.tool()
    def remove_target(player_id: int) -> str:
        """Remove a player from the faction target list.

        Args:
            player_id: Torn player ID to remove.
        """
        target_repo = get_service("target_repo")
        target_repo.remove_target(player_id)
        return json.dumps(
            {"player_id": player_id, "status": "removed"},
            indent=2,
        )
