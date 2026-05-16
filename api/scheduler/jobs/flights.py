"""Flight-tracker scheduler job (FFScouter parity, Phase 2A).

Runs every 60 s on the leader worker only. Pattern mirrors ``refresh_data``:
read shared state from ``api.scheduler.engine.get_state``, walk the tracked
player set, and persist transitions through ``FlightRepository``.

State is intentionally kept in two places:

* SQLite (``flight_events`` table) — durable history; survives restarts.
* ``_last_status`` (in-memory dict) — last raw ``status.state`` per player,
  so we can detect the Okay→Traveling and Traveling→Okay edges without
  hitting the DB every tick. The DB is the source of truth for *currently
  in air* (via ``most_recent_open``); the in-memory dict is just an edge
  detector that doesn't need to be perfect — at worst we miss the first
  transition after a process restart, which the next status change
  reconciles automatically.

Why not derive everything from the DB? Two reasons. First, the `Okay→Okay`
case must be a no-op without a DB read, otherwise every tick burns one
``SELECT`` per tracked player. Second, the DB only knows "did the player
have an open flight"; it doesn't store "was the player previously in
Hospital", which we need to distinguish Hospital→Traveling (real
departure) from Hospital→Okay (just woke up).
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from api.scheduler.jobs._log_helpers import report_job_error, with_sentry_capture
from api.flights import (
    classify_ticket_class,
    detect_transition,
    parse_destination_from_description,
)

logger = logging.getLogger("tm-hub.jobs.flights")

# Cap concurrent Torn API calls — faction members + war enemies can be
# ~200 players; firing all at once would burn through the per-key rate
# budget instantly. 10 matches the pattern used by refresh_data's bars
# fan-out.
_STATUS_SEM = asyncio.Semaphore(10)

# Player ID → last observed `status.state` string. Survives within a worker
# process; lost on restart (and reconciled on next status change).
_last_status: dict[int, str] = {}

# Stale-row sweep cadence. Running it every tick is wasteful; we kick it off
# at most once per hour.
_STALE_SWEEP_INTERVAL = 3600
_last_stale_sweep: float = 0.0

# Any open flight older than this gets force-closed by the paranoia sweep.
# Longest legitimate flight (South Africa standard) is 17820 s ≈ 5 h, so
# anything past 8 h is unambiguously a stuck row.
_STALE_OPEN_AGE_SECONDS = 8 * 3600


async def _fetch_status(torn_client, player_id: int) -> dict[str, Any] | None:
    """Fetch a single player's status block. Returns a dict with keys
    ``state``, ``description`` or ``None`` on upstream error.

    Uses the existing ``fetch_user_profile_stats`` helper which we know
    works against v1's flat `status.state/description` shape. Adding a
    dedicated minimal endpoint would shave ~30 % off the per-call payload
    but isn't worth diverging from a battle-tested helper for the first
    cut.

    NB: v1 because v2 nests profile fields under `profile: {...}` and the
    existing helper already deals with the v1 → flat shape. Migrating to v2
    is tracked in docs/torn-api-v2-migration.md and would touch 4+ callers.
    """
    async with _STATUS_SEM:
        try:
            data = await torn_client.fetch_user_profile_stats(player_id)
        except Exception as exc:  # noqa: BLE001 — fan-out: never let one player kill the tick.
            logger.warning("status fetch for %s failed: %s", player_id, exc)
            return None
    if not data:
        return None
    return {
        "state": data.get("status_state") or "",
        # `description` isn't returned by fetch_user_profile_stats today —
        # fall back to the state name so the destination parser still has
        # something to chew on (it'll be "Traveling", which yields "" and
        # we keep the previous destination, which is correct).
        "description": data.get("status_description") or data.get("status_state") or "",
    }


def _resolve_tracked_ids(state: dict) -> set[int]:
    """Union of faction members + current war enemies.

    Both are best-effort: any lookup failure yields an empty contribution
    rather than aborting the tick. The function is sync because the data is
    already cached by upstream refresh_data / fetch_war calls — we only
    touch the in-memory pieces here.
    """
    ids: set[int] = set()
    key_repo = state.get("key_repo")
    if key_repo is not None:
        try:
            ids.update(pid for pid, _ in key_repo.get_all_player_ids_with_keys())
        except Exception as exc:  # noqa: BLE001 — DB hiccup must not kill the tick.
            logger.warning("flight tracker: key_repo enumeration failed: %s", exc)
    return ids


async def _resolve_enemy_ids(torn_client, faction_id: int) -> set[int]:
    """Pull enemy faction member IDs from the v2/faction/{id}/members cache.

    Returns ``set()`` if no war is active or upstream fails — the tracker
    then only watches our own faction, which is the steady-state during
    peacetime."""
    if not torn_client:
        return set()
    try:
        war = await torn_client.fetch_war()
    except Exception as exc:  # noqa: BLE001
        logger.warning("flight tracker: fetch_war failed: %s", exc)
        return set()
    if not war or not war.factions:
        return set()
    opponent = next(
        (f for f in war.factions if f.id != faction_id),
        None,
    )
    if opponent is None:
        return set()
    try:
        members = await torn_client.fetch_enemy_members(opponent.id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("flight tracker: fetch_enemy_members(%s) failed: %s", opponent.id, exc)
        return set()
    return {m.id for m in members}


async def _process_player(
    *,
    player_id: int,
    status: dict[str, Any],
    flight_repo,
    now: int,
) -> str | None:
    """Apply the state-machine for one player. Returns a short tag for
    logging ("departed", "landed:wlt", ...) or None when nothing changed."""
    curr_state = status.get("state") or ""
    description = status.get("description") or ""
    prev_state = _last_status.get(player_id, "Okay")
    _last_status[player_id] = curr_state

    transition = detect_transition(prev_state, curr_state)
    if transition == "none":
        return None

    if transition == "departed":
        # If we somehow have an old open flight (stuck after restart, etc.),
        # let `expire_stale_open` deal with it — opening a new row is more
        # useful than failing this tick.
        destination = parse_destination_from_description(description) or "unknown"
        flight_repo.record_event(
            player_id=player_id,
            departed_at=now,
            destination=destination,
            ticket_class="standard",  # placeholder; refined on landing
            source="torn_api",
            observed_at=now,
        )
        return "departed"

    # transition == "landed"
    open_row = flight_repo.most_recent_open(player_id)
    if not open_row:
        # No open flight on record — the departure happened before we
        # started tracking, or before this worker process started. Nothing
        # to refine, just acknowledge.
        return "landed:no-row"
    flight_repo.mark_landed(open_row["id"], now)
    duration = now - int(open_row["departed_at"])
    cls = classify_ticket_class(duration, str(open_row["destination"]))
    flight_repo.update_ticket_class(open_row["id"], cls)
    return f"landed:{cls}"


@with_sentry_capture("flights_tick")
async def run_flights_tick() -> None:
    """Top-level scheduler entry. One full sweep per 60 s tick."""
    global _last_stale_sweep
    from api.scheduler.engine import get_state

    state = get_state()
    torn_client = state.get("torn_client")
    flight_repo = state.get("flight_repo")
    faction_id = state.get("faction_id", 0)

    if not torn_client or not flight_repo:
        return

    now = int(time.time())

    # Paranoia: at most once per hour, force-close anything stuck > 8 h.
    if now - _last_stale_sweep >= _STALE_SWEEP_INTERVAL:
        try:
            expired = flight_repo.expire_stale_open(now - _STALE_OPEN_AGE_SECONDS)
            if expired:
                logger.warning("flight tracker: force-closed %d stale open rows", expired)
        except Exception as exc:  # noqa: BLE001
            report_job_error(
                logger, "stale sweep failed: %s", exc, job="flights_tick:stale_sweep",
            )
        _last_stale_sweep = now

    tracked = _resolve_tracked_ids(state)
    enemy_ids = await _resolve_enemy_ids(torn_client, faction_id)
    tracked.update(enemy_ids)
    if not tracked:
        return

    start = time.time()
    statuses = await asyncio.gather(
        *(_fetch_status(torn_client, pid) for pid in tracked),
        return_exceptions=False,
    )

    departed = 0
    landed = 0
    failures = 0
    for pid, status in zip(tracked, statuses):
        if not status:
            failures += 1
            continue
        try:
            tag = await _process_player(
                player_id=pid, status=status, flight_repo=flight_repo, now=now,
            )
        except Exception as exc:  # noqa: BLE001
            report_job_error(
                logger, "process_player(%s) failed: %s", exc,
                job="flights_tick:process_player",
                extra_tags={"player_id": str(pid)},
            )
            failures += 1
            continue
        if tag == "departed":
            departed += 1
        elif tag and tag.startswith("landed"):
            landed += 1

    elapsed_ms = (time.time() - start) * 1000
    if departed or landed or failures:
        logger.info(
            "flights_tick: tracked=%d departed=%d landed=%d failures=%d in %.0fms",
            len(tracked), departed, landed, failures, elapsed_ms,
        )
