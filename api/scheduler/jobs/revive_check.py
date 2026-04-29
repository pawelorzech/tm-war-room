from __future__ import annotations

import logging

from api.scheduler.jobs._log_helpers import with_sentry_capture

logger = logging.getLogger("tm-hub.scheduler.revive")


@with_sentry_capture("revive_check")
async def run_revive_check() -> None:
    """Scheduler entry point for revive monitor. Runs every 10 minutes."""
    from api.scheduler.engine import get_state
    from api.scheduler.jobs.refresh_data import war_active
    from api.bots.revive_monitor import run

    state = get_state()
    torn_client = state.get("torn_client")
    chat_repo = state.get("chat_repo")
    chat_manager = state.get("chat_manager")

    if not torn_client or not chat_repo:
        logger.warning("Revive check skipped: dependencies not ready")
        return

    result = await run(
        torn_client=torn_client,
        chat_repo=chat_repo,
        chat_manager=chat_manager,
        war_active=war_active,
    )
    if result["posted"]:
        logger.info("Revive check: posted (%d risky members)", result["risky_count"])
    else:
        logger.debug("Revive check: %s", result["message"])
