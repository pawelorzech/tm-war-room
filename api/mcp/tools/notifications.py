from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def create_notification(player_id: int, title: str, message: str, notification_type: str = "info") -> str:
        """Create a notification for a specific player.

        Args:
            player_id: Torn player ID to notify.
            title: Notification title.
            message: Notification body text.
            notification_type: Type of notification (default "info").
        """
        notification_repo = get_service("notification_repo")
        notif_id = notification_repo.create(
            player_id=player_id,
            type=notification_type,
            title=title,
            message=message,
        )
        return json.dumps(
            {"notification_id": notif_id, "player_id": player_id, "status": "created"},
            indent=2,
        )
