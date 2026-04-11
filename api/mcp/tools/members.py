from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    async def faction_overview() -> str:
        """Faction overview: member count, online/offline breakdown, war and chain status, and compact member list."""
        from api.config import FACTION_ID

        torn_client = get_service("torn_client")

        members = await torn_client.fetch_members()
        war = await torn_client.fetch_war()
        chain = await torn_client.fetch_chain()

        online = [m for m in members if m.status.state != "Offline"]

        member_list = [
            {
                "id": m.id,
                "name": m.name,
                "level": m.level,
                "state": m.status.state,
                "days_in_faction": m.days_in_faction,
            }
            for m in members
        ]

        result: dict = {
            "faction_id": FACTION_ID,
            "total_members": len(members),
            "online_count": len(online),
            "offline_count": len(members) - len(online),
        }

        if war is not None:
            factions = {f.id: f for f in war.factions}
            enemy = [f for f in war.factions if f.id != FACTION_ID]
            our = [f for f in war.factions if f.id == FACTION_ID]
            result["war"] = {
                "war_id": war.war_id,
                "enemy": enemy[0].name if enemy else None,
                "our_score": our[0].score if our else None,
                "their_score": enemy[0].score if enemy else None,
            }
        else:
            result["war"] = None

        result["chain"] = {
            "current": chain.get("current"),
            "max": chain.get("max"),
            "timeout": chain.get("timeout"),
        }

        result["members"] = member_list

        return json.dumps(result, indent=2, default=str)
