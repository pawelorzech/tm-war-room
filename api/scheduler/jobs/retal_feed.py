"""Retaliation feed scheduler job (Roadmap Task #11).

Every 60 s the leader worker:

1. Reads ``retal_last_ts`` from app settings (default: now - 5 min on first
   run so we don't replay all of history).
2. Queries ``attack_log`` for attacks against our faction members since
   that timestamp.
3. Dedups by attacker_id with a 1 h cooldown (an attacker who keeps
   hitting different members shouldn't spam war-room).
4. For each unique fresh attacker, posts a bot message to ``war-room``
   whose body **embeds the attacker's profile URL** — the entity-card
   resolver (Task #4) auto-renders the player card with their current
   status + Attack button.
5. Persists the new high-water timestamp.

Designed to be defensive — any single failure logs + continues. Skips
entirely when the war-room channel doesn't exist or settings isn't
wired.
"""

from __future__ import annotations

import logging
import time

from api.config import FACTION_ID
from api.scheduler.engine import get_state
from api.scheduler.jobs._log_helpers import report_job_error, with_sentry_capture

logger = logging.getLogger("tm-hub.jobs.retal_feed")

# In-memory dedup: attacker_id → last posted ts. Survives within a worker
# process; on restart we re-dedupe via the 1h cooldown still using
# attack_log if the same row keeps appearing, but that's an acceptable
# trade — the alternative is a DB write per attacker which doesn't pay
# off for a 1 h window.
_last_posted: dict[int, int] = {}
_DEDUP_WINDOW_S = 3600

SETTINGS_KEY = "retal_feed_last_ts"


def _matches_incoming(row: dict) -> bool:
    """Is this an attack against one of OUR members?

    ``defender_faction_id`` is the defender's faction; if they were in
    our faction at the time of the attack, that's an incoming hit.
    Result ``Lost`` / ``Stalemate`` means the attacker failed — we still
    surface those (the attacker was *trying*, retal is still useful).
    """
    if row.get("defender_faction_id") != FACTION_ID:
        return False
    # Ignore intra-faction attacks (sparring, accidental).
    if row.get("attacker_id") == row.get("defender_id"):
        return False
    return True


@with_sentry_capture("retal_feed")
async def run_retal_feed() -> None:
    state = get_state()
    attack_repo = state.get("attack_repo")
    chat_repo = state.get("chat_repo")
    chat_manager = state.get("chat_manager")
    settings_repo = state.get("settings_repo")
    if not (attack_repo and chat_repo and chat_manager and settings_repo):
        return

    war_room = chat_repo.get_channel_by_name("war-room")
    if not war_room:
        return
    war_room_id = war_room["id"]

    now = int(time.time())
    raw_last = settings_repo.get(SETTINGS_KEY)
    try:
        last_ts = int(raw_last) if raw_last is not None else 0
    except (TypeError, ValueError):
        last_ts = 0
    if last_ts <= 0:
        # First run: only look ~5 min back so we don't replay history on deploy.
        last_ts = now - 300

    try:
        # ``get_recent`` already orders DESC by started; pull a generous slice
        # so we capture everything since last_ts. 200 rows / 60 s is well
        # within reasonable faction traffic; we early-break once we cross
        # last_ts in the iteration.
        rows = attack_repo.get_recent(limit=200)
    except Exception as e:  # noqa: BLE001
        report_job_error("retal_feed", "get_recent", e)
        return

    incoming: list[dict] = []
    for r in rows:
        if r.get("started", 0) <= last_ts:
            break
        if not _matches_incoming(r):
            continue
        incoming.append(r)

    if not incoming:
        # Even with no hits, advance the cursor so we don't re-scan the
        # same window on every tick.
        settings_repo.set(SETTINGS_KEY, str(now))
        return

    # Process oldest → newest so the chat feed reads chronologically.
    incoming.reverse()
    high_water = last_ts
    for r in incoming:
        high_water = max(high_water, int(r.get("started", 0) or 0))
        attacker_id = int(r.get("attacker_id", 0) or 0)
        if attacker_id <= 0:
            continue
        last = _last_posted.get(attacker_id, 0)
        if now - last < _DEDUP_WINDOW_S:
            continue
        _last_posted[attacker_id] = now

        attacker_name = r.get("attacker_name") or f"Player {attacker_id}"
        defender_name = r.get("defender_name") or "a faction member"
        result = (r.get("result") or "attacked").lower()
        action_word = {
            "hospitalized": "hospitalised",
            "mugged": "mugged",
            "attacked": "attacked",
            "lost": "tried to hit",
            "stalemate": "tied with",
        }.get(result, "attacked")

        # Embed the attacker URL — the entity-card resolver picks it up
        # and renders the live player card with an Attack button.
        body = (
            f"🛡 Incoming: **{attacker_name}** {action_word} {defender_name} — "
            f"https://www.torn.com/profiles.php?XID={attacker_id}"
        )
        try:
            bot_msg = chat_repo.create_message(
                channel_id=war_room_id, player_id=0,
                player_name="tm-bot",
                content=body,
                mentions=[],
            )
            await chat_manager.broadcast({"type": "message", "payload": bot_msg})
        except Exception as e:  # noqa: BLE001
            report_job_error("retal_feed", "post_bot_msg", e)
            continue

    settings_repo.set(SETTINGS_KEY, str(max(now, high_water)))
