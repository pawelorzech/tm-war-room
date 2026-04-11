from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def list_chat_channels() -> str:
        """List all faction chat channels with their type, description, and position."""
        chat_repo = get_service("chat_repo")
        channels = chat_repo.get_channels()
        return json.dumps(channels, indent=2, default=str)

    @mcp.tool()
    def send_chat_message(channel_id: int, content: str) -> str:
        """Send a message to a faction chat channel as Bombel (superadmin).

        Args:
            channel_id: ID of the chat channel.
            content: Message text to send.
        """
        from api.config import SUPERADMIN_ID

        chat_repo = get_service("chat_repo")
        msg = chat_repo.create_message(
            channel_id=channel_id,
            player_id=SUPERADMIN_ID,
            player_name="Bombel",
            content=content,
        )
        return json.dumps(msg, indent=2, default=str)
