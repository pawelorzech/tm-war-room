"""Live entity-data resolver for chat entity cards.

Takes the typed entity refs produced by :mod:`api.chat_entities` and turns them
into compact payloads the frontend renders as cards (`PlayerCard`, `ItemCard`,
`FactionCard`, `WarCard`).

Cache strategy
--------------
Each kind has its own TTL — chat is bursty but cards must feel live.
We use a per-process dict cache here rather than the ``torn_client`` cache so
that resolver-shaped payloads (post-transform) are reused across requests
without re-running the transform.

* ``player``    — 60s
* ``faction``   — 60s
* ``item``      — 300s (items metadata is essentially static; market value
                  moves more slowly than player state)
* ``rankedwar`` — 15s (live score moves fast during an active war)

The 100 calls/min/key budget is honoured because:

* Player/faction/war upstream fetches go through ``torn_client`` which has its
  own TTL cache.
* Items reuse :func:`api.routers.market.ensure_items_cache` — one fetch per
  five-minute window for *all* items.

Batch size is capped at 50 entities per request; pathological pastes that
include hundreds of links don't get to walk the budget.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

logger = logging.getLogger("tm-hub.chat.resolver")

# Maximum entities accepted per resolve call. Picked to keep the worst-case
# fan-out under 50 unique upstream fetches, comfortably inside the 100/min
# budget even if every entity is uncached.
MAX_BATCH = 50

_TTL = {
    "player": 60,
    "faction": 60,
    "item": 300,
    "rankedwar": 15,
}

# Module-level cache: {f"{kind}:{id}": (ts, payload_or_None)}.
_cache: dict[str, tuple[float, dict | None]] = {}


def _cache_get(key: str, ttl: int) -> tuple[bool, dict | None]:
    """Return ``(hit, payload)``. Negative results are cached too."""
    entry = _cache.get(key)
    if entry is None:
        return False, None
    ts, value = entry
    if time.time() - ts > ttl:
        return False, None
    return True, value


def _cache_set(key: str, value: dict | None) -> None:
    _cache[key] = (time.time(), value)


# ---------------------------------------------------------------------------
# Status colour mapping for the player card chip.
# ---------------------------------------------------------------------------

_STATUS_COLORS = {
    "Okay": "green",
    "Hospital": "red",
    "Jail": "red",
    "Traveling": "blue",
    "Abroad": "blue",
    "Federal": "red",
    "Fallen": "gray",
}


def _status_color(state: str) -> str:
    return _STATUS_COLORS.get(state, "gray")


# Lucide icon key per status state. Frontend (React) maps via lucide-react;
# companion (Tampermonkey) maps to inline SVG path strings — keys must match.
_STATUS_ICONS = {
    "Okay": "circle",
    "Traveling": "plane",
    "Abroad": "plane",
    "Hospital": "heart-pulse",
    "Jail": "lock",
    "Federal": "shield-alert",
    "Fallen": "skull",
}


def _status_icon(state: str) -> str:
    return _STATUS_ICONS.get(state, "circle")


# 2-letter codes for the Torn travel destinations. Anything not listed falls
# back to the first two letters of the country name uppercased.
_COUNTRY_CODES = {
    "Mexico": "MX",
    "Cayman Islands": "CI",
    "Canada": "CA",
    "Hawaii": "HI",
    "United Kingdom": "UK",
    "Argentina": "AR",
    "Switzerland": "CH",
    "Japan": "JP",
    "China": "CN",
    "United Arab Emirates": "AE",
    "South Africa": "ZA",
    "Torn": "TC",
}


def _country_code(name: str) -> str:
    if not name:
        return ""
    if name in _COUNTRY_CODES:
        return _COUNTRY_CODES[name]
    # Fallback: first two letters of the longest word.
    cleaned = name.strip().replace("-", " ")
    parts = [p for p in cleaned.split() if p]
    base = max(parts, key=len) if parts else cleaned
    return base[:2].upper()


# Torn travel descriptions follow exactly two shapes — we anchor on those.
_TRAVELING_RE = re.compile(r"^Traveling to (?P<dest>.+)$|^Traveling from .+ to (?P<dest2>.+)$")
_RETURNING_RE = re.compile(r"^Returning to Torn from (?P<from>.+)$")
_DURATION_PARTS_RE = re.compile(r"(\d+)\s*(day|hour|minute)s?", re.IGNORECASE)


def _short_duration(text: str) -> str:
    """Extract "2h 14m" / "1d" / "45m" from a duration phrase.

    Returns "" if no numbers are found; caller falls back to the raw text.
    """
    if not text:
        return ""
    parts = _DURATION_PARTS_RE.findall(text)
    if not parts:
        return ""
    unit_letter = {"day": "d", "hour": "h", "minute": "m"}
    has_days = any(unit.lower() == "day" for _, unit in parts)
    out: list[str] = []
    for n, unit in parts:
        unit_l = unit.lower()
        if unit_l == "minute" and has_days:
            # Too noisy in the chip — drop minutes when days are present.
            continue
        out.append(f"{n}{unit_letter[unit_l]}")
    return " ".join(out)


def _status_short(state: str, description: str) -> str:
    """Compact one-line status for the entity-card chip.

    Falls back to the raw description if nothing matches — better to render
    the full string than render nothing.
    """
    desc = (description or "").strip()
    state = (state or "").strip()

    if state == "Okay":
        return "Okay"

    if state in ("Traveling", "Abroad"):
        m = _TRAVELING_RE.match(desc)
        if m:
            dest = m.group("dest") or m.group("dest2") or ""
            return f"→ {_country_code(dest)}" if dest else desc
        m = _RETURNING_RE.match(desc)
        if m:
            origin = m.group("from") or ""
            return f"← {_country_code(origin)}" if origin else desc
        # "In <country>" — Abroad with no travel in progress.
        if desc.startswith("In "):
            return desc[3:5].upper() if len(desc) >= 5 else desc
        return desc

    if state in ("Hospital", "Jail", "Federal"):
        dur = _short_duration(desc)
        return dur or desc

    if state == "Fallen":
        return "Fallen"

    return desc or state or "Unknown"


# ---------------------------------------------------------------------------
# Per-kind resolvers
# ---------------------------------------------------------------------------


async def resolve_player(tc, player_id: int) -> dict | None:
    """Build a player card for ``player_id``. Returns ``None`` on failure."""
    key = f"player:{player_id}"
    hit, payload = _cache_get(key, _TTL["player"])
    if hit:
        return payload

    fetch = getattr(tc, "fetch_user_basic", None)
    if fetch is None:
        # Older client builds: degrade gracefully via the profile-stats helper.
        fetch = getattr(tc, "fetch_user_profile_stats", None)
    if fetch is None:
        _cache_set(key, None)
        return None

    try:
        raw = await fetch(player_id)
    except Exception as e:  # noqa: BLE001 — never crash chat on upstream blips
        logger.warning("resolve_player(%s) failed: %s", player_id, e)
        _cache_set(key, None)
        return None

    if not raw:
        _cache_set(key, None)
        return None

    status = raw.get("status") or {}
    state = status.get("state", "") if isinstance(status, dict) else str(status)
    desc = status.get("description", "") if isinstance(status, dict) else ""
    last_action = raw.get("last_action") or {}
    if isinstance(last_action, dict):
        last_action_text = last_action.get("relative", "")
        last_action_ts = int(last_action.get("timestamp", 0) or 0)
    else:
        last_action_text = str(last_action)
        last_action_ts = 0
    last_action_seconds = (
        max(0, int(time.time()) - last_action_ts) if last_action_ts > 0 else None
    )
    faction = raw.get("faction") or {}
    if isinstance(faction, dict):
        faction_tag = faction.get("faction_tag", "") or faction.get("tag", "")
        faction_name = faction.get("faction_name", "") or faction.get("name", "")
    else:
        faction_tag = ""
        faction_name = ""

    status_full = desc or state or "Unknown"
    card = {
        "kind": "player",
        "id": player_id,
        "name": raw.get("name", "") or f"Player {player_id}",
        "level": int(raw.get("level", 0) or 0),
        "faction_tag": faction_tag,
        "faction_name": faction_name,
        "status_text": status_full,
        "status_full": status_full,
        "status_short": _status_short(state or "", desc or ""),
        "status_icon": _status_icon(state or ""),
        "status_color": _status_color(state or ""),
        "last_action_text": last_action_text,
        "last_action_seconds": last_action_seconds,
        # 2026-05-17: Torn deprecated /loader.php?sid=attack — clicking it now
        # returns "This endpoint is no longer available. Please use the new
        # endpoints instead (page.php)." Use /page.php?sid=attack instead.
        # The rest of the codebase already uses this form (see torn-urls.ts).
        "attack_url": f"https://www.torn.com/page.php?sid=attack&user2ID={player_id}",
        "profile_url": f"https://www.torn.com/profiles.php?XID={player_id}",
    }
    _cache_set(key, card)
    return card


async def resolve_item(tc, item_id: int) -> dict | None:
    """Build an item card. Reuses the shared items cache from market.py."""
    key = f"item:{item_id}"
    hit, payload = _cache_get(key, _TTL["item"])
    if hit:
        return payload

    try:
        from api.routers.market import ensure_items_cache
        items = await ensure_items_cache(tc)
    except Exception as e:  # noqa: BLE001
        logger.warning("resolve_item(%s) items cache failed: %s", item_id, e)
        _cache_set(key, None)
        return None

    match: dict | None = None
    for it in items or []:
        if it.get("id") == item_id:
            match = it
            break
    if not match:
        _cache_set(key, None)
        return None

    card = {
        "kind": "item",
        "id": item_id,
        "name": match.get("name", "") or f"Item {item_id}",
        "image": f"https://www.torn.com/images/items/{item_id}/large.png",
        "market_low": int(match.get("market_value", 0) or 0),
        "type": match.get("type", ""),
        "circulation": int(match.get("circulation", 0) or 0),
        "market_url": f"https://www.torn.com/imarket.php#/p=shop&step=shop&type=&searchname={match.get('name','')}",
        "wiki_url": f"https://www.tornwiki.io/items/{item_id}",
    }
    _cache_set(key, card)
    return card


async def resolve_faction(tc, faction_id: int) -> dict | None:
    """Build a faction card via ``torn_client.fetch_faction_info``."""
    key = f"faction:{faction_id}"
    hit, payload = _cache_get(key, _TTL["faction"])
    if hit:
        return payload

    try:
        info = await tc.fetch_faction_info(faction_id)
    except Exception as e:  # noqa: BLE001
        logger.warning("resolve_faction(%s) failed: %s", faction_id, e)
        _cache_set(key, None)
        return None

    if info is None:
        _cache_set(key, None)
        return None

    card = {
        "kind": "faction",
        "id": faction_id,
        "name": getattr(info, "name", "") or f"Faction {faction_id}",
        "tag": getattr(info, "tag", ""),
        "members_count": int(getattr(info, "members_count", 0) or 0),
        "respect": int(getattr(info, "respect", 0) or 0),
        "rank_name": getattr(info, "rank_name", ""),
        "url": f"https://www.torn.com/factions.php?step=profile&ID={faction_id}",
    }
    _cache_set(key, card)
    return card


async def resolve_rankedwar(tc, war_id: int) -> dict | None:
    """Build a war card. Looks up the war in the recent-wars feed; if it's the
    *live* war (one of our faction's), enriches with the live score endpoint.
    """
    key = f"rankedwar:{war_id}"
    hit, payload = _cache_get(key, _TTL["rankedwar"])
    if hit:
        return payload

    try:
        wars = await tc.fetch_ranked_wars()
    except Exception as e:  # noqa: BLE001
        logger.warning("resolve_rankedwar(%s) fetch failed: %s", war_id, e)
        _cache_set(key, None)
        return None

    # The Torn rankedwars feed is keyed by war_id; each war has `factions` as
    # a dict keyed by faction_id. We accept both forms in the URL (rare).
    matched: dict | None = None
    for war in wars or []:
        if not isinstance(war, dict):
            continue
        if war.get("id") == war_id:
            matched = war
            break
        factions = war.get("factions") or {}
        if isinstance(factions, dict) and str(war_id) in factions:
            matched = war
            break

    if matched is None:
        _cache_set(key, None)
        return None

    war_meta = matched.get("war") or {}
    factions = matched.get("factions") or {}
    ids = list(factions.keys())
    # Order: our faction first if known; else the one matching war_id first.
    primary_id = str(war_id) if str(war_id) in factions else (ids[0] if ids else "")
    other_ids = [fid for fid in ids if fid != primary_id]
    other_id = other_ids[0] if other_ids else ""

    us = factions.get(primary_id) or {}
    them = factions.get(other_id) or {}

    end_ts = int(war_meta.get("end", 0) or 0)
    winner = war_meta.get("winner") or 0
    ended = bool(winner) or (end_ts > 0 and end_ts <= int(time.time()))
    time_remaining_s = max(0, end_ts - int(time.time())) if not ended else 0

    card = {
        "kind": "rankedwar",
        "id": war_id,
        "ended": ended,
        "score_us": int(us.get("score", 0) or 0),
        "score_them": int(them.get("score", 0) or 0),
        "opponent_name": them.get("name", "") or "Opponent",
        "opponent_id": int(other_id) if other_id.isdigit() else 0,
        "us_name": us.get("name", "") or "Us",
        "target_score": int(war_meta.get("target", 0) or 0),
        "time_remaining_s": time_remaining_s,
        "url": f"https://www.torn.com/factions.php?step=profile&ID={primary_id}",
    }
    _cache_set(key, card)
    return card


# ---------------------------------------------------------------------------
# Batch entry point
# ---------------------------------------------------------------------------


_RESOLVERS = {
    "player": resolve_player,
    "item": resolve_item,
    "faction": resolve_faction,
    "rankedwar": resolve_rankedwar,
}


async def resolve_batch(
    tc, refs: list[dict[str, Any]], *, is_admin: bool = False
) -> dict[str, dict]:
    """Resolve a batch of entity refs, deduplicating by ``f"{kind}:{id}"``.

    Returns a dict keyed by ``"{kind}:{id}"`` containing only successfully
    resolved entities — callers treat missing keys as "no live data
    available right now".

    Raises :class:`ValueError` for over-sized batches.
    """
    if len(refs) > MAX_BATCH:
        raise ValueError(f"too many entities: {len(refs)} > {MAX_BATCH}")

    seen: dict[str, tuple[str, int]] = {}
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        kind = ref.get("kind")
        entity_id = ref.get("id")
        if kind not in _RESOLVERS:
            continue
        if not isinstance(entity_id, int) or entity_id <= 0:
            continue
        key = f"{kind}:{entity_id}"
        if key not in seen:
            seen[key] = (kind, entity_id)

    if not seen:
        return {}

    async def _one(kind: str, entity_id: int) -> tuple[str, dict | None]:
        payload = await _RESOLVERS[kind](tc, entity_id)
        return f"{kind}:{entity_id}", payload

    results = await asyncio.gather(
        *(_one(k, i) for (k, i) in seen.values()), return_exceptions=False
    )
    return {k: v for k, v in results if v is not None}
