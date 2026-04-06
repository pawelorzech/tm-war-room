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
    from api.scheduler.jobs.collect_stats import run_collect_stats
    from api.scheduler.jobs.refresh_spies import run_refresh_spies
    from api.scheduler.jobs.refresh_data import run_refresh_data
    from api.scheduler.jobs.collect_circulation import run_collect_circulation
    from api.scheduler.jobs.revive_check import run_revive_check

    global _state
    _state = app_state

    scheduler = AsyncScheduler()
    await scheduler.__aenter__()

    # Register callables explicitly, then reference by task_id
    await scheduler.configure_task("collect_stats", func=run_collect_stats)
    await scheduler.configure_task("refresh_spies", func=run_refresh_spies)
    await scheduler.configure_task("refresh_data", func=run_refresh_data)
    await scheduler.configure_task("collect_circulation", func=run_collect_circulation)

    await scheduler.add_schedule(
        "collect_stats",
        IntervalTrigger(minutes=15),
        id="collect_stats_schedule",
    )
    await scheduler.add_schedule(
        "refresh_spies",
        IntervalTrigger(minutes=30),
        id="refresh_spies_schedule",
    )
    await scheduler.add_schedule(
        "refresh_data",
        IntervalTrigger(seconds=30),
        id="refresh_data_schedule",
    )
    await scheduler.add_schedule(
        "collect_circulation",
        IntervalTrigger(minutes=15),
        id="collect_circulation_schedule",
    )

    await scheduler.configure_task("revive_check", func=run_revive_check)
    await scheduler.add_schedule(
        "revive_check",
        IntervalTrigger(minutes=10),
        id="revive_check_schedule",
    )

    await scheduler.start_in_background()

    logger.info("Scheduler started: collect_stats (15min), circulation (15min), refresh_spies (30min), refresh_data (30s), revive_check (10min)")
    return scheduler
