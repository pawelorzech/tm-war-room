"""Activity tracker tick (Phase 3A).

Every 5 minutes we sample the online/idle status of every tracked player —
faction members (continuous) + outsiders enrolled via Companion profile views —
and credit a 5-minute bin if they're currently active. The repository's UPSERT
sums on conflict, so re-running the same tick within the same bin is a no-op
for the data (the second pass adds 0 because we only credit when active and
the bin already has its 300s).

Why we *also* refresh ``last_bin_at`` for outsiders here, not just from the
profile view: the 14-day purge ages outsiders against ``last_bin_at``, so a
player who never logs on after enrollment ages out naturally — but a player
who actively logs on resets the purge clock and stays tracked indefinitely.
"""
from __future__ import annotations

import asyncio
import logging
import time

from api.activity import BIN_SIZE_SECONDS, bin_start_for
from api.scheduler.jobs._log_helpers import log_job_error, with_sentry_capture

logger = logging.getLogger("tm-hub.jobs.activity")

# Cap concurrent outsider fetches so a 200-outsider day can't blow the Torn
# per-key rate limit (100 req/min). Matches the bars fan-out semaphore in
# refresh_data.py.
_OUTSIDER_SEM = asyncio.Semaphore(10)

_ACTIVE_STATUSES = {"Online", "Idle"}


async def _fetch_outsider_status(torn_client, player_id: int) -> str | None:
    """Return ``last_action.status`` for *player_id* via Torn v1 profile.

    Mirrors the per-player call in refresh_data.py's stakeout block — we use v1
    because v2's user/profile shape inconsistencies aren't worth fighting for a
    single string field. Returns None on any failure so the caller can skip.
    """
    async with _OUTSIDER_SEM:
        try:
            resp = await torn_client._http.get(
                f"https://api.torn.com/user/{player_id}",
                params={"selections": "profile", "key": torn_client._api_key},
            )
            if resp.status_code != 200:
                return None
            from api.torn_client import _json
            data = await _json(resp)
            last_action = data.get("last_action") if isinstance(data, dict) else None
            if isinstance(last_action, dict):
                status = last_action.get("status")
                return str(status) if status is not None else None
            return None
        except Exception:
            return None


@with_sentry_capture("activity_tick")
async def run_activity_tick() -> None:
    """Sample online status for every tracked player and credit a 5-min bin."""
    from api.config import ENABLE_ACTIVITY
    from api.routers import activity as activity_mod
    from api.scheduler.engine import get_state

    if not ENABLE_ACTIVITY:
        return

    state = get_state()
    # torn_client comes from scheduler state (already wired by every job).
    # activity_repo + key_store come from the router module — Phase 0 wired
    # them there in main.py's lifespan, and the spec forbids touching main.py
    # again to add scheduler-state entries.
    torn_client = state.get("torn_client")
    activity_repo = activity_mod.activity_repo
    key_store = activity_mod.key_store

    if not torn_client or not activity_repo:
        logger.debug("activity_tick skipped: dependencies not ready")
        return

    now = int(time.time())
    bin_start = bin_start_for(now)

    member_status: dict[int, str] = {}
    outsider_status: dict[int, str] = {}

    # 1. Faction members — one batched call via the cached helper.
    try:
        members = await torn_client.fetch_members()
        for m in members or []:
            la = getattr(m, "last_action", None)
            status = getattr(la, "status", None) if la is not None else None
            if status:
                member_status[int(m.id)] = str(status)
    except Exception as e:
        log_job_error(logger, "activity_tick: faction members fetch failed: %s", e)

    # If members fetch didn't give us a faction member's status (key issued
    # for the player but Torn dropped them from the response), fall back to
    # the key_store roster — we still want a bin row of 0 to anchor the time
    # series. Phase 3 priority is "did the player come online?" so we only
    # write rows where we actually have a status, but we still account for
    # the roster gap by listing them in tracked_ids below.
    faction_ids: set[int] = set()
    if key_store:
        try:
            for row in key_store.get_all_keys() or []:
                pid = int(row["player_id"])
                faction_ids.add(pid)
        except Exception as e:
            log_job_error(logger, "activity_tick: key_store roster read failed: %s", e)

    # 2. Outsiders — parallel per-player profile fetches, capped at 10.
    outsider_ids: list[int] = []
    try:
        outsider_ids = [int(r["player_id"]) for r in activity_repo.tracked_outsiders()]
    except Exception as e:
        log_job_error(logger, "activity_tick: tracked_outsiders read failed: %s", e)

    if outsider_ids:
        results = await asyncio.gather(
            *[_fetch_outsider_status(torn_client, pid) for pid in outsider_ids],
            return_exceptions=False,
        )
        for pid, status in zip(outsider_ids, results):
            if status:
                outsider_status[pid] = status

    # 3. Write bins. We always insert a row for tracked players — 0 seconds
    # when offline so the heatmap has explicit gaps, BIN_SIZE_SECONDS when
    # online/idle. UPSERT sums-on-conflict makes a re-tick safe.
    member_active = 0
    outsider_active = 0

    for pid in faction_ids:
        status = member_status.get(pid)
        online_seconds = BIN_SIZE_SECONDS if status in _ACTIVE_STATUSES else 0
        try:
            activity_repo.add_bin(pid, bin_start, online_seconds)
            if online_seconds:
                member_active += 1
        except Exception as e:
            log_job_error(logger, "activity_tick: add_bin (member) failed: %s", e)

    for pid in outsider_ids:
        status = outsider_status.get(pid)
        online_seconds = BIN_SIZE_SECONDS if status in _ACTIVE_STATUSES else 0
        try:
            activity_repo.add_bin(pid, bin_start, online_seconds)
            if online_seconds:
                outsider_active += 1
                # Bump the purge anchor only when the outsider actually came
                # online — a permanently-offline enrolled player ages out
                # naturally via enrolled_at fallback in purge_idle_outsiders.
                activity_repo.update_outsider_last_bin(pid, bin_start)
        except Exception as e:
            log_job_error(logger, "activity_tick: add_bin (outsider) failed: %s", e)

    logger.info(
        "activity_tick @bin=%d: %d/%d members online, %d/%d outsiders online",
        bin_start,
        member_active,
        len(faction_ids),
        outsider_active,
        len(outsider_ids),
    )
