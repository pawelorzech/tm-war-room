from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP

_VALID_TYPES = {"alert", "warning", "info", "success"}


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def list_announcements(include_revoked: bool = False) -> str:
        """List announcements. Active only by default, or all including revoked.

        Args:
            include_revoked: If True, include revoked announcements.
        """
        key_store = get_service("key_store")

        if include_revoked:
            announcements = key_store.get_all_announcements()
        else:
            announcements = key_store.get_active_announcements()

        return json.dumps(announcements, indent=2, default=str)

    @mcp.tool()
    def create_announcement(ann_type: str, message: str, expires_at: str = "") -> str:
        """Create a faction-wide announcement.

        Args:
            ann_type: One of: alert, warning, info, success.
            message: Announcement text.
            expires_at: Optional ISO datetime for expiry (empty for no expiry).
        """
        from api.config import SUPERADMIN_ID

        if ann_type not in _VALID_TYPES:
            return json.dumps({"error": f"Invalid type '{ann_type}'. Valid: {sorted(_VALID_TYPES)}"})

        key_store = get_service("key_store")
        ann_id = key_store.create_announcement(
            type=ann_type,
            message=message,
            created_by=SUPERADMIN_ID,
            expires_at=expires_at or None,
        )
        return json.dumps({"announcement_id": ann_id, "status": "created"}, indent=2)

    @mcp.tool()
    def revoke_announcement(announcement_id: int, reason: str = "") -> str:
        """Revoke (deactivate) an announcement.

        Args:
            announcement_id: Announcement ID.
            reason: Optional reason for revoking.
        """
        from api.config import SUPERADMIN_ID

        key_store = get_service("key_store")
        success = key_store.revoke_announcement(
            ann_id=announcement_id,
            revoked_by=SUPERADMIN_ID,
            reason=reason or None,
        )
        if not success:
            return json.dumps({"error": f"Announcement {announcement_id} not found or already revoked"})

        return json.dumps({"announcement_id": announcement_id, "status": "revoked"}, indent=2)
