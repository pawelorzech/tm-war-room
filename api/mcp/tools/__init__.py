"""MCP tool registration — discovers and registers all tool modules."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register_all_tools(mcp: FastMCP) -> None:
    from api.mcp.tools import (
        system, competitions, announcements, spy, targets, members,
        chain, stats, war, stakeouts, bounties, loot, chat, notifications,
    )

    system.register(mcp)
    competitions.register(mcp)
    announcements.register(mcp)
    spy.register(mcp)
    targets.register(mcp)
    members.register(mcp)
    chain.register(mcp)
    stats.register(mcp)
    war.register(mcp)
    stakeouts.register(mcp)
    bounties.register(mcp)
    loot.register(mcp)
    chat.register(mcp)
    notifications.register(mcp)
