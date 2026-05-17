"""War-room pinned card builder (Roadmap Task #9).

Builds the live-data payload the chat war-room card needs:

* score (us / them / target)
* time remaining
* opponent name + id
* top 5 easiest **currently attackable** enemy targets sorted by threat
  (online + Okay status — filters out hospital, jail, traveling, offline)

Cross-member energy (the "ready members" section) is deferred to v2 — it
needs the BYOK ingestion path that lives in the scheduler refresh job and
isn't wired into chat yet. The card simply hides that section for now.

The builder is called by ``GET /api/chat/war-room-card`` (in ``routers/chat.py``)
and is kept in its own module so it can be unit-tested without the FastAPI
stack.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from api.config import FACTION_ID

logger = logging.getLogger("tm-hub.chat.war-card")

# Hard cap on top-target list. The card is one row in the chat UI — more
# than this just clutters mobile. Chain leaders will go to /team for the
# full list.
MAX_TARGETS = 5


def _compute_threats(members: list, *, baseline=None) -> list[tuple[Any, int, str]]:
    """Score members by threat. Pure dispatch to api.threat so the heavy
    import only happens when a war is actually active.

    Returns ``[(member, threat_score, threat_label), ...]``. ``member`` is
    whatever the caller passes (FactionMember-like with ``model_dump``).
    """
    from api.threat import compute_threat

    out: list[tuple[Any, int, str]] = []
    for m in members:
        # We don't have spy data here (yet). Use level-based threat — same
        # path the /api/enemy fallback uses when no personalstats are
        # available.
        score, label = compute_threat(None, getattr(m, "level", 0), baseline=baseline)
        out.append((m, score, label))
    return out


def _is_attackable(dump: dict) -> bool:
    """A target is attackable when they're online (or idle) AND status==Okay.

    Anything in Hospital / Jail / Traveling / Federal / Fallen is wasted
    energy; offline gives the same chain points but is slower to land —
    chain leaders prefer online & Okay.
    """
    status = dump.get("status") or {}
    last_action = dump.get("last_action") or {}
    state = (status.get("state") or "").lower()
    online_status = (last_action.get("status") or "").lower()
    return state == "okay" and online_status in ("online", "idle")


async def build_war_room_card(torn_client) -> dict:
    """Build the war-room card payload. Returns ``{"active": False}`` when
    no ranked war is currently running."""
    try:
        war = await torn_client.fetch_war()
    except Exception as e:  # noqa: BLE001
        logger.warning("build_war_room_card: fetch_war failed: %s", e)
        return {"active": False, "error": "war_fetch_failed"}

    if not war or not getattr(war, "war_id", None):
        return {"active": False}

    factions = list(getattr(war, "factions", None) or [])
    us = next((f for f in factions if f.id == FACTION_ID), None)
    them = next((f for f in factions if f.id != FACTION_ID), None)
    if them is None and factions:
        them = factions[0]
    if us is None:
        us = next((f for f in factions if them and f.id != them.id), None)

    score_us = int(getattr(us, "score", 0) or 0) if us else 0
    score_them = int(getattr(them, "score", 0) or 0) if them else 0

    end_ts = int(getattr(war, "end", 0) or 0)
    now = int(time.time())
    time_remaining_s = max(0, end_ts - now)

    top_targets: list[dict] = []
    if them is not None and torn_client is not None:
        try:
            enemies = await torn_client.fetch_enemy_members(them.id)
        except Exception as e:  # noqa: BLE001
            logger.warning("build_war_room_card: fetch_enemy_members failed: %s", e)
            enemies = []
        scored = _compute_threats(enemies or [])
        scored.sort(key=lambda t: t[1])  # easiest first
        for m, score, label in scored:
            dump = m.model_dump() if hasattr(m, "model_dump") else dict(m)
            if not _is_attackable(dump):
                continue
            top_targets.append({
                "id": dump.get("id"),
                "name": dump.get("name", "") or f"Player {dump.get('id')}",
                "level": int(dump.get("level", 0) or 0),
                "status_text": (dump.get("status") or {}).get("description")
                    or (dump.get("status") or {}).get("state", ""),
                "threat_score": int(score),
                "threat_label": label,
                "attack_url": f"https://www.torn.com/page.php?sid=attack&user2ID={dump.get('id')}",
            })
            if len(top_targets) >= MAX_TARGETS:
                break

    return {
        "active": True,
        "war_id": war.war_id,
        "opponent_name": getattr(them, "name", "") if them else "",
        "opponent_id": int(getattr(them, "id", 0) or 0) if them else 0,
        "score_us": score_us,
        "score_them": score_them,
        "target_score": int(getattr(war, "target", 0) or 0),
        "time_remaining_s": time_remaining_s,
        "top_targets": top_targets,
    }
