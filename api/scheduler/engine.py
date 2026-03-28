from __future__ import annotations
import logging

logger = logging.getLogger("tm-hub.scheduler")

async def create_scheduler(app_state: dict):
    """Create and configure the background scheduler. Returns scheduler instance."""
    from apscheduler import AsyncScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    from apscheduler.triggers.cron import CronTrigger
    from api.scheduler.jobs.collect_stats import collect_stat_snapshots
    from api.scheduler.jobs.refresh_spies import refresh_spy_cache

    key_repo = app_state["key_repo"]
    stats_repo = app_state["stats_repo"]
    spy_service = app_state["spy_service"]
    torn_client = app_state["torn_client"]
    tornstats_key = app_state.get("tornstats_key", "")

    async def _collect_stats():
        await collect_stat_snapshots(key_repo, stats_repo, torn_client)

    async def _refresh_spies():
        await refresh_spy_cache(spy_service, torn_client, tornstats_key)

    scheduler = AsyncScheduler()
    await scheduler.add_schedule(_collect_stats, CronTrigger(hour=4, minute=0), id="collect_stats")
    await scheduler.add_schedule(_refresh_spies, IntervalTrigger(minutes=30), id="refresh_spies")

    logger.info("Scheduler configured: collect_stats (daily 4:00 UTC), refresh_spies (every 30min)")
    return scheduler
