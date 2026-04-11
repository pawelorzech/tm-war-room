from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def chain_report(hours: int = 24) -> str:
        """Chain report: per-member attack stats (hits, wins, losses, respect, max chain) for the last N hours.

        Args:
            hours: Number of hours to look back (default 24).
        """
        attack_repo = get_service("attack_repo")
        since = int(time.time()) - (hours * 3600)
        report = attack_repo.get_chain_report(since)
        return json.dumps(report, indent=2, default=str)

    @mcp.tool()
    def chain_analytics(days: int = 7) -> str:
        """Top attackers by respect earned over the last N days.

        Args:
            days: Number of days to look back (default 7).
        """
        attack_repo = get_service("attack_repo")
        top = attack_repo.get_top_attackers(days)
        return json.dumps(top, indent=2, default=str)
