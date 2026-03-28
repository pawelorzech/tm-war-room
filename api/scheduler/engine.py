from __future__ import annotations
import logging

logger = logging.getLogger("tm-hub.scheduler")

# Module-level state for scheduler jobs to access
_state: dict = {}


def get_state() -> dict:
    return _state


async def create_and_start_scheduler(app_state: dict):
    """Create, configure, and start the background scheduler. Returns the scheduler."""
    from apscheduler import AsyncScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    from apscheduler.triggers.cron import CronTrigger
    from api.scheduler.jobs.collect_stats import run_collect_stats
    from api.scheduler.jobs.refresh_spies import run_refresh_spies

    global _state
    _state = app_state

    scheduler = AsyncScheduler()
    await scheduler.__aenter__()

    # Register callables explicitly, then reference by task_id
    await scheduler.configure_task("collect_stats", func=run_collect_stats)
    await scheduler.configure_task("refresh_spies", func=run_refresh_spies)

    await scheduler.add_schedule(
        "collect_stats",
        CronTrigger(hour=4, minute=0),
        id="collect_stats_schedule",
    )
    await scheduler.add_schedule(
        "refresh_spies",
        IntervalTrigger(minutes=30),
        id="refresh_spies_schedule",
    )
    await scheduler.start_in_background()

    logger.info("Scheduler started: collect_stats (daily 4:00 UTC), refresh_spies (every 30min)")
    return scheduler
