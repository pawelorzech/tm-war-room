"""Chain-assist hospital-detection poller (Roadmap Task #10).

Every 20 s the leader worker:

1. Lists all open chain-assist rows.
2. Fetches each target's basic profile (one API call per active assist —
   small N, normally 0–2).
3. Records the new status. When it flips from ``Hospital`` → ``Okay`` the
   target is back up; we broadcast a chat event so cards refresh instantly
   AND push a notification to every "hitter" who joined.

Designed to **always degrade gracefully** — no exception escapes this
function and crashes the scheduler.
"""

from __future__ import annotations

import logging

from api.scheduler.engine import get_state
from api.scheduler.jobs._log_helpers import report_job_error, with_sentry_capture

logger = logging.getLogger("tm-hub.jobs.chain_assist_poll")


@with_sentry_capture("chain_assist_poll")
async def run_chain_assist_poll() -> None:
    state = get_state()
    repo = state.get("chain_assist_repo")
    tc = state.get("torn_client")
    chat_manager = state.get("chat_manager")
    push_service = state.get("push_service")
    if not repo or not tc or not chat_manager:
        return

    try:
        active = repo.list_active()
    except Exception as e:  # noqa: BLE001
        report_job_error("chain_assist_poll", "list_active", e)
        return
    if not active:
        return

    for assist in active:
        target_id = assist.get("target_id")
        if not target_id:
            continue
        try:
            data = await tc.fetch_user_basic(target_id)
        except Exception as e:  # noqa: BLE001
            logger.debug("fetch_user_basic(%s) failed: %s", target_id, e)
            continue
        if not data:
            continue
        status = data.get("status") or {}
        new_state = status.get("state", "") if isinstance(status, dict) else ""
        if not new_state:
            continue
        try:
            prev = repo.update_target_status(assist["id"], new_state)
        except Exception as e:  # noqa: BLE001
            report_job_error("chain_assist_poll", f"update_status({assist['id']})", e)
            continue
        if prev is None or prev == new_state:
            continue

        # Hospital → Okay transition: re-emerged, hit them.
        if prev == "Hospital" and new_state == "Okay":
            target_name = assist.get("target_name") or f"Player {target_id}"
            try:
                await chat_manager.broadcast({
                    "type": "chain_assist_update",
                    "payload": {
                        "assist_id": assist["id"],
                        "back_up": True,
                        "target_id": target_id,
                        "target_name": target_name,
                    },
                })
            except Exception as e:  # noqa: BLE001
                logger.warning("broadcast back-up event failed: %s", e)

            if push_service is not None:
                hitters = assist.get("hitters") or []
                for h in hitters:
                    pid = int(h.get("id", 0) or 0)
                    if pid <= 0:
                        continue
                    try:
                        push_service.dispatch_to_player(
                            pid,
                            "chain_assist",
                            f"{target_name} is back up!",
                            f"Your chain target {target_name} just left hospital — go go go.",
                            f"https://www.torn.com/page.php?sid=attack&user2ID={target_id}",
                        )
                    except Exception as e:  # noqa: BLE001
                        logger.debug("push to %s failed: %s", pid, e)
