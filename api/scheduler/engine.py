from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("tm-hub.scheduler")

# Module-level state for scheduler jobs to access
_state: dict = {}

# Per-task last-run tracker, populated by the JobReleased event listener.
# Shape: {"task_id": {"finished_at": "ISO-8601", "outcome": "ok"|"error"}}
_last_run_at: dict[str, dict] = {}


def get_state() -> dict:
    return _state


def get_last_run_at() -> dict[str, dict]:
    return dict(_last_run_at)


async def create_and_start_scheduler(app_state: dict, leader_election=None):
    """Create, configure, and start the background scheduler. Returns the scheduler.

    If ``leader_election`` is provided and this process is a follower (not leader),
    we register tasks but do NOT call ``start_in_background`` — only the leader
    actually runs the jobs. This prevents duplicate execution in multi-worker
    deployments.
    """
    from apscheduler import AsyncScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    from api.scheduler.jobs.collect_stats import run_collect_stats
    from api.scheduler.jobs.refresh_spies import run_refresh_spies
    from api.scheduler.jobs.refresh_stale_spies import run_refresh_stale_spies
    from api.scheduler.jobs.refresh_data import run_refresh_data
    from api.scheduler.jobs.collect_circulation import run_collect_circulation
    from api.scheduler.jobs.revive_check import run_revive_check
    from api.scheduler.jobs.refresh_avatars import run_refresh_avatars
    from api.scheduler.jobs.armoury_poll import run_armoury_poll
    from api.scheduler.jobs.collect_company_snapshots import run_collect_company_snapshots
    from api.scheduler.jobs.discover_companies import run_discover_companies
    from api.scheduler.jobs.check_trains_stagnation import run_check_trains_stagnation
    from api.scheduler.jobs.backup_keys_db import run_backup_keys_db
    from api.scheduler.jobs.flights import run_flights_tick

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
    await scheduler.configure_task("refresh_stale_spies", func=run_refresh_stale_spies)
    await scheduler.add_schedule(
        "refresh_stale_spies",
        IntervalTrigger(hours=1),
        id="refresh_stale_spies_schedule",
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

    await scheduler.configure_task("refresh_avatars", func=run_refresh_avatars)
    await scheduler.add_schedule(
        "refresh_avatars",
        IntervalTrigger(hours=12),
        id="refresh_avatars_schedule",
    )

    await scheduler.configure_task("armoury_poll", func=run_armoury_poll)
    await scheduler.add_schedule(
        "armoury_poll",
        IntervalTrigger(minutes=5),
        id="armoury_poll_schedule",
    )

    await scheduler.configure_task("collect_company_snapshots", func=run_collect_company_snapshots)
    await scheduler.add_schedule(
        "collect_company_snapshots",
        IntervalTrigger(hours=24),
        id="collect_company_snapshots_schedule",
    )

    await scheduler.configure_task("discover_companies", func=run_discover_companies)
    await scheduler.add_schedule(
        "discover_companies",
        IntervalTrigger(hours=24),
        id="discover_companies_schedule",
    )

    await scheduler.configure_task("check_trains_stagnation", func=run_check_trains_stagnation)
    await scheduler.add_schedule(
        "check_trains_stagnation",
        IntervalTrigger(hours=24),
        id="check_trains_stagnation_schedule",
    )

    # F-18: daily encrypted backup of keys.db to B2 + retention sweep.
    # `start_time` 60s after scheduler boot → first backup runs ~1 min after deploy,
    # so a fresh deploy proves the pipeline end-to-end without waiting 24h.
    await scheduler.configure_task("backup_keys_db", func=run_backup_keys_db)
    await scheduler.add_schedule(
        "backup_keys_db",
        IntervalTrigger(hours=24, start_time=datetime.now(timezone.utc) + timedelta(seconds=60)),
        id="backup_keys_db_schedule",
    )

    # === Intel Pack jobs (Phase 1-4) ===
    # Each block is gated on its feature flag so a disabled phase does NOT
    # consume Torn rate-limit budget. Flags live in api.config and are read
    # *here* (not at module import) so an env-var flip on deploy is honoured
    # the moment the scheduler boots.
    from api import config as _intel_cfg
    if _intel_cfg.ENABLE_FLIGHTS:
        await scheduler.configure_task("flights_tick", func=run_flights_tick)
        await scheduler.add_schedule(
            "flights_tick",
            IntervalTrigger(seconds=60),
            id="flights_tick_schedule",
        )
        logger.info("Intel Pack: flights_tick registered (60s)")

    # Track every completed job so /api/admin/scheduler/status can answer
    # "is the collector still running?" without grepping container logs.
    try:
        from apscheduler import JobReleased, JobOutcome

        async def _track_job_completion(event: JobReleased) -> None:
            ts = getattr(event, "finished_at", None) or datetime.now(timezone.utc)
            _last_run_at[event.task_id] = {
                "finished_at": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "outcome": "ok" if event.outcome == JobOutcome.success else "error",
            }

        scheduler.event_broker.subscribe(
            _track_job_completion, event_types={JobReleased}, is_async=True,
        )
    except Exception as e:
        logger.warning("Could not subscribe to JobReleased events (%s) — last_run_at won't update.", e)

    if leader_election is None or leader_election.is_leader:
        await scheduler.start_in_background()
        logger.info(
            "Scheduler started (leader): collect_stats (15min), circulation (15min), refresh_spies (30min), "
            "refresh_stale_spies (1h), refresh_data (30s), revive_check (10min), refresh_avatars (12h), "
            "armoury_poll (5min), collect_company_snapshots (24h), discover_companies (24h), "
            "check_trains_stagnation (24h), backup_keys_db (24h)"
        )
    else:
        logger.info("Scheduler not started — this worker is a follower (leader runs jobs).")
    return scheduler
