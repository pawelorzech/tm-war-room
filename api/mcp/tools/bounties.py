from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    async def list_bounties() -> str:
        """Fetch active bounties from Torn, sorted by reward (highest first)."""
        torn_client = get_service("torn_client")
        bounties = await torn_client.fetch_bounties()

        sorted_bounties = sorted(
            bounties,
            key=lambda b: b.get("reward", 0) or 0,
            reverse=True,
        )
        return json.dumps(sorted_bounties, indent=2, default=str)
