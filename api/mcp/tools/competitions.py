from __future__ import annotations

import json
from typing import TYPE_CHECKING

from api.mcp.server import get_service

if TYPE_CHECKING:
    from fastmcp import FastMCP


def register(mcp: FastMCP) -> None:

    @mcp.tool()
    def list_competitions() -> str:
        """List all armoury restock competitions (active first)."""
        armoury_repo = get_service("armoury_repo")
        competitions = armoury_repo.get_all_competitions()
        return json.dumps(competitions, indent=2, default=str)

    @mcp.tool()
    def create_competition(
        name: str,
        categories: str,
        start_ts: int,
        end_ts: int,
        prize_text: str = "",
    ) -> str:
        """Create a new armoury restock competition.

        Args:
            name: Competition name.
            categories: Comma-separated categories (blood_bags, temporary, alcohol, medical, drugs, energy_drinks, candy).
            start_ts: Unix timestamp for competition start.
            end_ts: Unix timestamp for competition end.
            prize_text: Optional prize description.
        """
        from api.armoury import VALID_CATEGORIES
        from api.config import SUPERADMIN_ID

        armoury_repo = get_service("armoury_repo")

        cats = {c.strip() for c in categories.split(",") if c.strip()}
        invalid = cats - VALID_CATEGORIES
        if invalid:
            return json.dumps({"error": f"Invalid categories: {sorted(invalid)}. Valid: {sorted(VALID_CATEGORIES)}"})

        category_str = ",".join(sorted(cats))
        comp_id = armoury_repo.create_competition(
            name=name,
            category=category_str,
            start_ts=start_ts,
            end_ts=end_ts,
            created_by=SUPERADMIN_ID,
            prize_text=prize_text or None,
        )
        return json.dumps({"competition_id": comp_id, "status": "created"}, indent=2)

    @mcp.tool()
    def update_competition(
        comp_id: int,
        name: str = "",
        categories: str = "",
        start_ts: int = 0,
        end_ts: int = 0,
        prize_text: str = "",
    ) -> str:
        """Update fields on an existing competition. Only non-empty/non-zero values are applied.

        Args:
            comp_id: Competition ID.
            name: New name (empty to skip).
            categories: New comma-separated categories (empty to skip).
            start_ts: New start timestamp (0 to skip).
            end_ts: New end timestamp (0 to skip).
            prize_text: New prize text (empty to skip).
        """
        from api.armoury import VALID_CATEGORIES

        armoury_repo = get_service("armoury_repo")

        kwargs: dict = {}
        if name:
            kwargs["name"] = name
        if categories:
            cats = {c.strip() for c in categories.split(",") if c.strip()}
            invalid = cats - VALID_CATEGORIES
            if invalid:
                return json.dumps({"error": f"Invalid categories: {sorted(invalid)}. Valid: {sorted(VALID_CATEGORIES)}"})
            kwargs["category"] = ",".join(sorted(cats))
        if start_ts:
            kwargs["start_ts"] = start_ts
        if end_ts:
            kwargs["end_ts"] = end_ts
        if prize_text:
            kwargs["prize_text"] = prize_text

        if not kwargs:
            return json.dumps({"error": "No fields to update"})

        armoury_repo.update_competition(comp_id, **kwargs)
        return json.dumps({"competition_id": comp_id, "updated_fields": list(kwargs.keys())}, indent=2)

    @mcp.tool()
    def end_competition(comp_id: int) -> str:
        """End an active competition.

        Args:
            comp_id: Competition ID.
        """
        armoury_repo = get_service("armoury_repo")

        comp = armoury_repo.get_competition(comp_id)
        if not comp:
            return json.dumps({"error": f"Competition {comp_id} not found"})

        armoury_repo.end_competition(comp_id)
        return json.dumps({"competition_id": comp_id, "status": "ended"}, indent=2)

    @mcp.tool()
    def competition_leaderboard(comp_id: int) -> str:
        """Get competition details and leaderboard.

        Args:
            comp_id: Competition ID.
        """
        armoury_repo = get_service("armoury_repo")

        comp = armoury_repo.get_competition(comp_id)
        if not comp:
            return json.dumps({"error": f"Competition {comp_id} not found"})

        leaderboard = armoury_repo.get_leaderboard(comp_id)
        result = {
            "competition": comp,
            "leaderboard": leaderboard,
        }
        return json.dumps(result, indent=2, default=str)

    @mcp.tool()
    async def trigger_armoury_poll() -> str:
        """Manually trigger an armoury deposit poll for all active competitions."""
        from api.scheduler.jobs.armoury_poll import run_armoury_poll

        await run_armoury_poll()
        return json.dumps({"status": "poll_complete"})
