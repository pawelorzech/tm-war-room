from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from api.scheduler.jobs._log_helpers import report_job_error, with_sentry_capture
from api.services.spy import SpyService, spy_reported_at

logger = logging.getLogger("tm-hub.jobs.refresh_spies")


def _upsert_report(spy_service, player_id, stats, source, now_iso):
    """Upsert one source's spy report for a player. Returns True if written.

    Two skip conditions:
    1. Empty response (total<=0) — a missing spy in one source must not overwrite
       a real estimate built from the other.
    2. Estimate-only response (total>0 but per-stat all zero) — TornStats sometimes
       returns a level-based total guess with "N/A" per-stat. After _num() in the
       parser those become 0; we must not store the row, or refresh_estimate would
       pick it as the freshest report and the UI would render a wrong total next
       to four NaN/zero cells. See routers/spy._is_real_spy for the full rationale.
    """
    total = stats.get("total", 0) or 0
    if total <= 0:
        return False
    strength = stats.get("strength", 0) or 0
    defense = stats.get("defense", 0) or 0
    speed = stats.get("speed", 0) or 0
    dexterity = stats.get("dexterity", 0) or 0
    if strength + defense + speed + dexterity <= 0:
        return False
    spy_service.repo.upsert_report(
        player_id=player_id, player_name=stats.get("name"), source=source,
        strength=strength, defense=defense, speed=speed, dexterity=dexterity,
        total=total,
        confidence="estimate",
        reported_at=spy_reported_at(stats.get("timestamp"), now_iso),
    )
    return True


async def refresh_spy_cache(spy_service: SpyService, torn_client, tornstats_key: str = "") -> None:
    try:
        war = await torn_client.fetch_war()
        if not war or not war.factions:
            logger.debug("No active war, skipping spy refresh")
            return
        from api.config import FACTION_ID
        enemy_faction = next((f for f in war.factions if f.id != FACTION_ID), None)
        if not enemy_faction:
            return
        # Pull from both spy networks in parallel. TornStats and YATA are
        # independent — neither has full coverage, so we merge per-player.
        # NB: must use the dedicated battle-stats fetcher. fetch_tornstats_spy
        # returns PersonalStats (xanax/attacks/networth/...) — no strength/
        # defense/speed/dexterity/total. Until 2026-05-15 this job called the
        # wrong fetcher and getattr'd nonexistent fields, writing zeros every
        # 30 min and slowly overwriting real estimates. See test_refresh_spies.py.
        ts_task = (
            torn_client.fetch_tornstats_faction_battle_stats(enemy_faction.id, tornstats_key)
            if tornstats_key
            else asyncio.sleep(0, result={})
        )
        yata_task = torn_client.fetch_yata_faction_spies(enemy_faction.id)
        ts_result, yata_result = await asyncio.gather(ts_task, yata_task, return_exceptions=True)
        ts_data = ts_result if not isinstance(ts_result, Exception) and ts_result else {}
        yata_data = yata_result if not isinstance(yata_result, Exception) and yata_result else {}
        if not ts_data and not yata_data:
            logger.debug("No spy data returned from either source")
            return
        now = datetime.now(timezone.utc).isoformat()
        updated_players: set[int] = set()
        ts_written = 0
        yata_written = 0
        for player_id, stats in ts_data.items():
            if _upsert_report(spy_service, player_id, stats, "tornstats", now):
                updated_players.add(player_id)
                ts_written += 1
        for player_id, stats in yata_data.items():
            if _upsert_report(spy_service, player_id, stats, "yata", now):
                updated_players.add(player_id)
                yata_written += 1
        for pid in updated_players:
            spy_service.refresh_estimate(pid)
        logger.info(
            "Refreshed spy data for %d players (tornstats=%d yata=%d)",
            len(updated_players), ts_written, yata_written,
        )
    except Exception as e:
        report_job_error(logger, "Spy refresh failed: %s", e, job="refresh_spies")


@with_sentry_capture("refresh_spies")
async def run_refresh_spies() -> None:
    """Top-level entry point for APScheduler (must be importable, not nested)."""
    from api.scheduler.engine import get_state
    state = get_state()
    await refresh_spy_cache(state["spy_service"], state["torn_client"], state.get("tornstats_key", ""))
