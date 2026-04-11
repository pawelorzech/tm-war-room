from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    async def system_status() -> str:
        """Live faction status: member count, active war info, and current chain."""
        from api.config import FACTION_ID

        torn_client = get_service("torn_client")

        members = await torn_client.fetch_members()
        war = await torn_client.fetch_war()
        chain = await torn_client.fetch_chain()

        result: dict = {
            "faction_id": FACTION_ID,
            "member_count": len(members),
            "war_active": war is not None,
            "chain_info": {"current": chain.get("current")},
        }

        if war is not None:
            factions = {f.id: f for f in war.factions}
            enemy = [f for f in war.factions if f.id != FACTION_ID]
            our = [f for f in war.factions if f.id == FACTION_ID]
            result["war_info"] = {
                "war_id": war.war_id,
                "enemy_faction_id": enemy[0].id if enemy else None,
                "enemy_faction_name": enemy[0].name if enemy else None,
                "our_score": our[0].score if our else None,
                "their_score": enemy[0].score if enemy else None,
            }

        return json.dumps(result, indent=2, default=str)

    @mcp.tool()
    def system_info() -> str:
        """Static system info: app version, faction ID, superadmin, registered members, and admins."""
        from api.config import SUPERADMIN_ID, FACTION_ID, APP_VERSION

        key_store = get_service("key_store")

        result = {
            "app_version": APP_VERSION,
            "faction_id": FACTION_ID,
            "superadmin_id": SUPERADMIN_ID,
            "registered_members": len(key_store.get_keys_metadata()),
            "admins": key_store.get_admins(),
        }
        return json.dumps(result, indent=2, default=str)
