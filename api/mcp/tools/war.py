from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    async def war_status() -> str:
        """Current faction war status and recent ranked war history."""
        torn_client = get_service("torn_client")

        war = await torn_client.fetch_war()
        ranked_wars = await torn_client.fetch_ranked_wars()

        result: dict = {}

        if war is not None:
            result["current_war"] = {
                "war_id": war.war_id,
                "start": war.start,
                "end": war.end,
                "target": war.target,
                "winner": war.winner,
                "factions": [
                    {"id": f.id, "name": f.name, "score": f.score, "chain": f.chain}
                    for f in war.factions
                ],
            }
        else:
            result["current_war"] = "no active war"

        result["ranked_war_history"] = ranked_wars[:10] if ranked_wars else []

        return json.dumps(result, indent=2, default=str)
