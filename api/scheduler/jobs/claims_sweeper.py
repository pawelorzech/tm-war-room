"""Sweep expired hit claims and broadcast ``claim.expired`` per row.

Runs every 60 seconds (registered in ``api/scheduler/engine.py``). The sweeper
flips ``status='active' AND expires_at < now`` to ``status='expired'`` and
publishes one envelope per flipped row over the claim manager pub/sub so
every connected SSE client sees the state change instantly.

Idempotent by construction: the UPDATE only matches active rows, so the
second run within the same window finds nothing and exits in O(index lookup).
"""
from __future__ import annotations

import logging
import time

from api.scheduler.jobs._log_helpers import with_sentry_capture

logger = logging.getLogger("tm-hub.scheduler.claims_sweeper")


@with_sentry_capture("claims_sweeper")
async def run_claims_sweeper() -> None:
    """Expire stale claims + publish ``claim.expired`` for each."""
    # Late import: avoids circular module load at scheduler boot.
    from api.config import ENABLE_HIT_CALLING, FACTION_ID
    from api.routers import claims as claims_mod

    # Respect the feature flag — when off, we don't churn the DB or pubsub.
    if not ENABLE_HIT_CALLING:
        return

    repo = claims_mod.claim_repo
    manager = claims_mod.claim_manager
    if repo is None:
        logger.debug("claims_sweeper skipped: claim_repo not wired yet")
        return

    now = int(time.time())
    try:
        flipped = repo.expire_stale(now)
    except Exception as e:
        logger.warning("expire_stale failed: %s", e)
        raise

    if not flipped:
        return

    # Publish one event per row. We need the claimer's player_name so the
    # companion can render "[claimer] released …" without a follow-up call.
    key_store = claims_mod.key_store
    for row in flipped:
        claim_payload = dict(row)
        claim_payload["claimer_name"] = _name_of(key_store, row.get("claimer_id"))
        envelope = {"type": "claim.expired", "claim": claim_payload}
        if manager is not None:
            try:
                await manager.publish(envelope, FACTION_ID)
            except Exception as e:
                logger.warning(
                    "claims_sweeper publish failed for target=%s: %s",
                    row.get("target_id"), e,
                )
    logger.info("claims_sweeper expired %d claim(s)", len(flipped))


def _name_of(key_store, player_id) -> str | None:
    if key_store is None or player_id is None:
        return None
    try:
        entry = key_store.get_key(int(player_id))
    except Exception:
        return None
    return entry["player_name"] if entry else None
