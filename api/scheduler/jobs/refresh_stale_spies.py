from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from api.scheduler.jobs._log_helpers import report_job_error, with_sentry_capture
from api.services.spy import SpyService

logger = logging.getLogger("tm-hub.jobs.refresh_stale_spies")

# How old an estimate must be before we re-fetch from TornStats.
# Matches SpyService.EXACT_MAX_AGE_DAYS — past this point the "exact" badge is gone anyway.
STALE_THRESHOLD_DAYS = 7

# Per-run cap for the SCHEDULED job. With 1h interval = 1200 refreshes/day,
# enough to fully cycle a several-hundred-player database in under a day.
MAX_PER_RUN = 50

# Per-run cap for the ADMIN-TRIGGERED bulk refresh. Larger to let an admin
# blast through the entire backlog in one go. Still paced + per-player error-isolated.
MAX_PER_BULK = 500

# Pacing between TornStats calls. v2 limit is ~60/min, so we hold to ~55/min
# (1.1s between calls = 0.91 req/s) to stay comfortably under the cap.
PACE_SECONDS = 1.1


async def refresh_stale_estimates(
    spy_service: SpyService,
    torn_client,
    tornstats_key: str = "",
    max_per_run: int = MAX_PER_RUN,
) -> dict:
    """Re-fetch oldest spy_estimates rows from TornStats.

    refresh_spies (the every-30-min job) only batch-fetches the current enemy
    faction during a war. Everyone else's estimate ages indefinitely. This job
    closes that gap by walking the oldest rows on a slower cadence and
    refreshing them one by one via the single-player TornStats endpoint.

    Returns a dict ``{"refreshed": int, "attempted": int}`` so admin-triggered
    callers can surface progress in the UI.
    """
    if not tornstats_key:
        logger.debug("No TornStats API key configured, skipping stale spy refresh")
        return {"refreshed": 0, "attempted": 0}

    stale = spy_service.repo.get_stale_estimates(
        max_age_days=STALE_THRESHOLD_DAYS, limit=max_per_run
    )
    if not stale:
        logger.debug("No stale spy estimates to refresh")
        return {"refreshed": 0, "attempted": 0}

    refreshed = 0
    for row in stale:
        player_id = row["player_id"]
        try:
            ts_data = await torn_client.fetch_tornstats_spy_user(player_id, tornstats_key)
            if not ts_data or ts_data.get("total", 0) <= 0:
                continue
            now = datetime.now(timezone.utc).isoformat()
            spy_service.repo.upsert_report(
                player_id=player_id,
                player_name=ts_data.get("player_name") or row.get("player_name"),
                source="tornstats",
                strength=ts_data["strength"],
                defense=ts_data["defense"],
                speed=ts_data["speed"],
                dexterity=ts_data["dexterity"],
                total=ts_data["total"],
                confidence="estimate",
                reported_at=now,
            )
            spy_service.refresh_estimate(player_id)
            refreshed += 1
        except Exception as e:
            report_job_error(
                logger, f"stale spy refresh failed for player {player_id}: %s", e,
                job="refresh_stale_spies",
                extra_tags={"player_id": str(player_id)},
            )
        await asyncio.sleep(PACE_SECONDS)

    logger.info("Refreshed %d/%d stale spy estimates", refreshed, len(stale))
    return {"refreshed": refreshed, "attempted": len(stale)}


@with_sentry_capture("refresh_stale_spies")
async def run_refresh_stale_spies() -> None:
    """Top-level entry point for APScheduler (must be importable, not nested)."""
    from api.scheduler.engine import get_state
    state = get_state()
    await refresh_stale_estimates(
        state["spy_service"],
        state["torn_client"],
        state.get("tornstats_key", ""),
    )
