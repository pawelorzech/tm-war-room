from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def spy_search(query: str) -> str:
        """Search spy estimates by player name (case-insensitive substring match).

        Args:
            query: Part of the player name to search for.
        """
        spy_repo = get_service("spy_repo")
        all_estimates = spy_repo.get_all_estimates()
        q = query.lower()
        matches = [
            e for e in all_estimates
            if q in (e.get("player_name") or "").lower()
        ]
        return json.dumps(matches, indent=2, default=str)

    @mcp.tool()
    async def spy_estimate(player_id: int) -> str:
        """Get spy estimate for a player. Checks local DB first, falls back to TornStats.

        Args:
            player_id: Torn player ID.
        """
        spy_repo = get_service("spy_repo")
        estimate = spy_repo.get_estimate(player_id)
        if estimate:
            return json.dumps(estimate, indent=2, default=str)

        tornstats_key = get_service("tornstats_key")
        if tornstats_key:
            torn_client = get_service("torn_client")
            ts_data = await torn_client.fetch_tornstats_spy_user(player_id, tornstats_key)
            if ts_data:
                return json.dumps(ts_data, indent=2, default=str)

        return json.dumps({"player_id": player_id, "status": "no data"})

    @mcp.tool()
    async def spy_faction(faction_id: int) -> str:
        """Get spy estimates for all members of a faction.

        Args:
            faction_id: Torn faction ID.
        """
        torn_client = get_service("torn_client")
        spy_repo = get_service("spy_repo")

        members = await torn_client.fetch_enemy_members(faction_id)
        result = []
        for m in members:
            estimate = spy_repo.get_estimate(m.id)
            entry = {
                "player_id": m.id,
                "name": m.name,
                "level": m.level,
            }
            if estimate:
                entry["spy"] = {
                    "total": estimate.get("total"),
                    "strength": estimate.get("strength"),
                    "defense": estimate.get("defense"),
                    "speed": estimate.get("speed"),
                    "dexterity": estimate.get("dexterity"),
                    "confidence": estimate.get("confidence"),
                    "source": estimate.get("source"),
                }
            else:
                entry["spy"] = "unknown"
            result.append(entry)

        return json.dumps(result, indent=2, default=str)
