from __future__ import annotations
import logging
from datetime import datetime, timezone
from api.scheduler.jobs._log_helpers import report_job_error, with_sentry_capture
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
        # NB: must use the dedicated battle-stats fetcher. fetch_tornstats_spy
        # returns PersonalStats (xanax/attacks/networth/...) — no strength/
        # defense/speed/dexterity/total. Until 2026-05-15 this job called the
        # wrong fetcher and getattr'd nonexistent fields, writing zeros every
        # 30 min and slowly overwriting real estimates. See test_refresh_spies.py.
        spy_data = await torn_client.fetch_tornstats_faction_battle_stats(enemy_faction.id, tornstats_key)
        if not spy_data:
            return
        now = datetime.now(timezone.utc).isoformat()
        updated_players = []
        skipped_empty = 0
        for player_id, stats in spy_data.items():
            total = stats.get("total", 0) or 0
            # Defense in depth: never let an empty TornStats response (total=0)
            # poison existing real data. Refresh_estimate keeps prior reports,
            # but writing a fresh zero report would make this player's latest
            # report = 0, breaking compute_stat_threat downstream.
            if total <= 0:
                skipped_empty += 1
                continue
            spy_service.repo.upsert_report(
                player_id=player_id, player_name=stats.get("name"), source="tornstats",
                strength=stats.get("strength", 0) or 0,
                defense=stats.get("defense", 0) or 0,
                speed=stats.get("speed", 0) or 0,
                dexterity=stats.get("dexterity", 0) or 0,
                total=total,
                confidence="estimate", reported_at=now,
            )
            updated_players.append(player_id)
        for pid in updated_players:
            spy_service.refresh_estimate(pid)
        logger.info(
            "Refreshed spy data for %d players from TornStats (skipped %d empty)",
            len(updated_players), skipped_empty,
        )
    except Exception as e:
        report_job_error(logger, "Spy refresh failed: %s", e, job="refresh_spies")


@with_sentry_capture("refresh_spies")
async def run_refresh_spies() -> None:
    """Top-level entry point for APScheduler (must be importable, not nested)."""
    from api.scheduler.engine import get_state
    state = get_state()
    await refresh_spy_cache(state["spy_service"], state["torn_client"], state.get("tornstats_key", ""))
