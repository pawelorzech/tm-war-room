"""OC 2.0 digest payload builder (Roadmap Task #12).

Inspects the faction's planning organized crimes (the "queue" of OCs that
haven't fired yet) and summarises them into a compact card the chat UI
pins above the message list on ``#general`` / ``#leadership``:

* ``ready`` — crimes whose ``ready_at`` is in the past (or imminent) and
  every slot has a participant + ``planning_complete=True``.
* ``waiting`` — at least one slot still empty.
* ``blocked_by_tool`` — slot has a role but no participant *and* the role
  name suggests a tool (``Drug Pack``, ``Lockpick``, etc.) — we surface
  the tool name so leadership knows what's holding things up.
* ``traveling_members`` — participants on a planning OC who are currently
  abroad (an OC can't execute while a member is in the air).

The builder is the only pure-Python place to assemble this — the
endpoint in ``api/routers/chat.py`` is a thin shell around it so it's
trivially unit-testable.
"""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger("tm-hub.chat.oc-digest")

# Heuristics: roles whose name reads like a consumable tool. The Torn API
# doesn't tag these explicitly, but the role string is human-readable.
_TOOL_KEYWORDS = (
    "drug", "lockpick", "explosive", "molotov", "tool", "kit",
    "skimmer", "blowtorch", "scrambler", "spray", "cnc",
)


def _looks_like_tool(role: str) -> bool:
    if not role:
        return False
    r = role.lower()
    return any(k in r for k in _TOOL_KEYWORDS)


async def build_oc_digest_card(*, torn_client, fetch_team=None) -> dict:
    """Build the OC digest payload.

    ``fetch_team`` is an optional async callable returning
    ``[{id, name, status, ...}]`` for cross-checking traveling members.
    Pass ``None`` to skip the traveling-members enrichment.
    """
    if torn_client is None:
        return {"active": False}

    try:
        crimes = await torn_client.fetch_faction_crimes(cat="planning")
    except Exception as e:  # noqa: BLE001
        logger.warning("oc digest: fetch_faction_crimes failed: %s", e)
        return {"active": False, "error": "oc_fetch_failed"}

    if not crimes:
        return {"active": True, "ready": [], "waiting": [], "blocked_by_tool": [], "traveling_members": [], "counts": {"ready": 0, "waiting": 0, "blocked_tools": 0}}

    now = int(time.time())

    ready: list[dict] = []
    waiting: list[dict] = []
    blocked_tools: dict[str, int] = {}
    participant_ids: set[int] = set()

    for c in crimes:
        if not isinstance(c, dict):
            continue

        ready_at = int(c.get("ready_at") or 0)
        slots = c.get("slots") or c.get("participants") or []
        if isinstance(slots, dict):
            slots = list(slots.values())
        if not isinstance(slots, list):
            slots = []

        empty_slot_roles: list[str] = []
        filled_count = 0
        all_planning_complete = True

        for s in slots:
            if not isinstance(s, dict):
                continue
            user = s.get("user") or s
            pid = user.get("id") or s.get("player_id") or s.get("id", 0) or 0
            role = s.get("role") or s.get("position") or ""
            if pid:
                filled_count += 1
                participant_ids.add(int(pid))
                if not s.get("planning_complete", True):
                    all_planning_complete = False
            else:
                empty_slot_roles.append(role)
                if _looks_like_tool(role):
                    blocked_tools[role] = blocked_tools.get(role, 0) + 1

        total = len(slots)
        empty = len(empty_slot_roles)

        entry = {
            "id": int(c.get("id", 0) or 0),
            "name": c.get("name") or "Unknown crime",
            "ready_at": ready_at,
            "filled": filled_count,
            "total": total,
            "empty_roles": empty_slot_roles,
        }
        if empty == 0 and all_planning_complete and (ready_at == 0 or ready_at <= now):
            ready.append(entry)
        else:
            waiting.append(entry)

    # Traveling member detection — only when caller provided a team source.
    traveling_members: list[dict] = []
    if fetch_team is not None and participant_ids:
        try:
            team = await fetch_team()
        except Exception as e:  # noqa: BLE001
            logger.warning("oc digest: fetch_team failed: %s", e)
            team = []
        for m in team or []:
            mid = m.get("id") or m.get("player_id")
            if not mid or int(mid) not in participant_ids:
                continue
            status = m.get("status") or {}
            state = status.get("state", "") if isinstance(status, dict) else ""
            if state.lower() in ("traveling", "abroad"):
                traveling_members.append({
                    "id": int(mid),
                    "name": m.get("name", "") or f"Player {mid}",
                    "status_text": status.get("description") if isinstance(status, dict) else state,
                })

    blocked_list = [
        {"tool": tool, "count": count}
        for tool, count in sorted(blocked_tools.items(), key=lambda kv: -kv[1])
    ]

    # Stable ordering: soonest ready first.
    ready.sort(key=lambda e: e.get("ready_at") or 0)
    waiting.sort(key=lambda e: e.get("ready_at") or 0)

    return {
        "active": True,
        "ready": ready[:10],         # hard cap so a runaway faction doesn't blow up the card
        "waiting": waiting[:10],
        "blocked_by_tool": blocked_list[:5],
        "traveling_members": traveling_members[:10],
        "counts": {
            "ready": len(ready),
            "waiting": len(waiting),
            "blocked_tools": sum(blocked_tools.values()),
            "traveling": len(traveling_members),
        },
    }
