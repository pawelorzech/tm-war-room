"""Daily purge for the activity tracker (Phase 3A).

Drops:
- ``activity_bins`` rows older than 14 days (heatmaps only ever look back 14d).
- ``activity_tracked_outsiders`` rows where the player has either never come
  online OR has been silent for 14 days. The repo's
  ``purge_idle_outsiders`` collapses both clauses via
  ``COALESCE(last_bin_at, enrolled_at) < cutoff``.

Runs every 24h; no leader-gating needed beyond what ``engine.py`` already does.
"""
from __future__ import annotations

import logging
import time

from api.scheduler.jobs._log_helpers import log_job_error, with_sentry_capture

logger = logging.getLogger("tm-hub.jobs.activity_purge")

RETENTION_DAYS: int = 14
RETENTION_SECONDS: int = RETENTION_DAYS * 86400


@with_sentry_capture("activity_purge")
async def run_activity_purge() -> None:
    from api.config import ENABLE_ACTIVITY
    from api.routers import activity as activity_mod

    if not ENABLE_ACTIVITY:
        return

    # Read activity_repo from the router module — Phase 0 wired it there in
    # main.py's lifespan, and the spec forbids editing main.py to add
    # scheduler-state entries.
    activity_repo = activity_mod.activity_repo
    if not activity_repo:
        logger.debug("activity_purge skipped: activity_repo not ready")
        return

    now = int(time.time())
    cutoff = now - RETENTION_SECONDS

    bins_removed = 0
    outsiders_removed = 0

    try:
        bins_removed = activity_repo.purge_old_bins(cutoff=cutoff)
    except Exception as e:
        log_job_error(logger, "activity_purge: purge_old_bins failed: %s", e)

    try:
        outsiders_removed = activity_repo.purge_idle_outsiders(
            now=now,
            idle_seconds=RETENTION_SECONDS,
        )
    except Exception as e:
        log_job_error(logger, "activity_purge: purge_idle_outsiders failed: %s", e)

    logger.info(
        "activity_purge: dropped %d bins + %d idle outsiders (cutoff=%d)",
        bins_removed,
        outsiders_removed,
        cutoff,
    )
