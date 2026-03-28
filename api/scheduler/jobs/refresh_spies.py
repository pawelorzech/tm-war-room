from __future__ import annotations
import logging
from datetime import datetime, timezone
from api.services.spy import SpyService

logger = logging.getLogger("tm-hub.jobs.refresh_spies")

async def refresh_spy_cache(spy_service: SpyService, torn_client, tornstats_key: str = "") -> None:
    if not tornstats_key:
        logger.debug("No TornStats API key configured, skipping spy refresh")
        return
    try:
        war = await torn_client.fetch_war()
        if not war or not war.factions:
            logger.debug("No active war, skipping spy refresh")
            return
        from api.config import FACTION_ID
        enemy_faction = next((f for f in war.factions if f.id != FACTION_ID), None)
        if not enemy_faction:
            return
        spy_data = await torn_client.fetch_tornstats_spy(enemy_faction.id, tornstats_key)
        if not spy_data:
            return
        now = datetime.now(timezone.utc).isoformat()
        updated_players = []
        for player_id, ps in spy_data.items():
            spy_service.repo.upsert_report(
                player_id=player_id, player_name=None, source="tornstats",
                strength=getattr(ps, "strength", 0) or 0,
                defense=getattr(ps, "defense", 0) or 0,
                speed=getattr(ps, "speed", 0) or 0,
                dexterity=getattr(ps, "dexterity", 0) or 0,
                total=getattr(ps, "total", 0) or 0,
                confidence="estimate", reported_at=now,
            )
            updated_players.append(player_id)
        for pid in updated_players:
            spy_service.refresh_estimate(pid)
        logger.info("Refreshed spy data for %d players from TornStats", len(updated_players))
    except Exception as e:
        logger.error("Spy refresh failed: %s", e)


async def run_refresh_spies() -> None:
    """Top-level entry point for APScheduler (must be importable, not nested)."""
    from api.scheduler.engine import get_state
    state = get_state()
    await refresh_spy_cache(state["spy_service"], state["torn_client"], state.get("tornstats_key", ""))
