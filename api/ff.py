"""Fair-fight (FF) score computation — FFScouter parity Phase 1A.

The FF score answers "is this target a fair fight for me?" using the
publicly documented FFScouter formula:

    FF = 1 + 8/9 * (target_total / caller_total)

where ``*_total`` is the sum of the four battle stats (STR + DEF + SPD + DEX).
The score is clamped to a minimum of 1.0 — a target with zero stats still gets
the floor, never a fraction.

This module is the FALLBACK source: the Companion only renders the FF chip
when a real spy estimate is unavailable. We still return a score in both cases
so the API contract is uniform, but ``source`` flags whether we got there via
a per-stat spy report (``"spy"``) or by deriving totals from ``personalstats``
deltas (``"formula"``).

Dominant-stat detection:
- When source="spy" → the largest of the four per-stat values.
- When source="formula" → a coarse proxy from personalstats counters
  (see ``_dom_stat_from_personalstats``). Proxy mapping is intentionally
  conservative; we'd rather return ``"STR"`` (the most common build) than
  invent confidence we don't have.

Tie-break order when stats are equal: STR > DEF > SPD > DEX. Stable so that
the cached value doesn't flap between requests for evenly-trained players.
"""
from __future__ import annotations

import logging
import time

from api.stat_estimator import estimate_stats
from api.torn_client import extract_rank_tier

logger = logging.getLogger("tm-hub.ff")

# 6h cache TTL — FF scores drift slowly (target's stats change on the order
# of days, not minutes). Matches the spy refresh cadence so a fresh spy
# triggers a recompute on the next request rather than waiting a full day.
FF_TTL_SECONDS = 6 * 3600

# Stable tie-break order. STR wins ties because most Torn builds train it
# first; this keeps the dom_stat stable for evenly-distributed enemies.
_STAT_ORDER = ("STR", "DEF", "SPD", "DEX")


def _ff_formula(target_total: float, caller_total: float) -> float:
    """FFScouter's published formula: 1 + 8/9 * (target/caller).

    Caller with zero stats is treated as 1 (a new account asking about a
    veteran shouldn't get an undefined score). Result is clamped to >= 1.0.
    """
    if caller_total <= 0:
        caller_total = 1.0
    raw = 1.0 + (8.0 / 9.0) * (target_total / caller_total)
    return max(1.0, round(raw, 3))


def _dom_stat_from_spy(spy_estimate: dict) -> str:
    """Pick the dominant stat from a spy estimate's per-stat breakdown.

    Spy estimates carry STR/DEF/SPD/DEX as separate fields. We pick the
    largest and use ``_STAT_ORDER`` as the tie-breaker so identical stats
    always resolve to STR.
    """
    stats = {
        "STR": spy_estimate.get("strength", 0) or 0,
        "DEF": spy_estimate.get("defense", 0) or 0,
        "SPD": spy_estimate.get("speed", 0) or 0,
        "DEX": spy_estimate.get("dexterity", 0) or 0,
    }
    # Sort by value desc; on tie, _STAT_ORDER index ascending.
    return max(_STAT_ORDER, key=lambda s: (stats[s], -_STAT_ORDER.index(s)))


def _dom_stat_from_personalstats(ps: dict) -> str:
    """Coarse dominant-stat proxy from personalstats counters.

    We don't have per-stat totals from personalstats — only behavioural
    counters that correlate with each stat:
      - attacks_won → high DEX (you hit them first)
      - defends_won → high DEF (you tanked their hit)
      - bestkillstreak / damage_done → STR (raw hitting power)
      - attacks_stealthed → SPD (you out-paced them)

    This is intentionally a *signal*, not a measurement. The Companion
    will render the chip with low confidence styling when source=formula.

    Ties resolve via ``_STAT_ORDER`` (STR first).
    """
    counters = {
        "STR": (ps.get("attackdamage", 0) or 0) + (ps.get("bestkillstreak", 0) or 0) * 1000,
        "DEF": (ps.get("defendswon", 0) or 0) + (ps.get("defendsstalemated", 0) or 0),
        "SPD": (ps.get("attacksstealthed", 0) or 0),
        "DEX": (ps.get("attackswon", 0) or 0) - (ps.get("attacksstealthed", 0) or 0),
    }
    # Negative DEX (more stealth than attacks) shouldn't pick DEX; clamp.
    counters = {k: max(0, v) for k, v in counters.items()}
    if all(v == 0 for v in counters.values()):
        return "STR"
    return max(_STAT_ORDER, key=lambda s: (counters[s], -_STAT_ORDER.index(s)))


async def _fetch_personalstats_total(torn_client, player_id: int) -> tuple[int, dict]:
    """Return ``(estimated_total, raw_personalstats)`` for *player_id*.

    Mirrors the spy router's heuristic path (api/routers/spy.py
    ``_build_fallback_estimate``): hit ``/v1/user/{id}`` with the path-style
    id (NOT query-string — that returns the key owner's stats), parse
    personalstats, run it through stat_estimator.

    Returns ``(0, {})`` on any failure so callers can fall back cleanly.
    """
    if torn_client is None:
        return 0, {}
    try:
        # See api/routers/spy.py for why this MUST be path-style id.
        # Reuse the existing _http session + cache via the public helper.
        from api.torn_client import _json
        resp = await torn_client._http.get(
            f"https://api.torn.com/user/{player_id}",
            params={
                "selections": "personalstats,profile",
                "key": torn_client._api_key,
            },
        )
        if resp.status_code != 200:
            return 0, {}
        raw = await _json(resp)
        ps_raw = raw.get("personalstats", {}) or {}
        level = raw.get("level", 0) or 0
        age = raw.get("age", 0) or 0
        # Pass rank tier — endgame floor + SE-uncap depend on it. The raw
        # response is the v1 user/{id}/?selections=personalstats,profile
        # shape, so ``rank`` lives at the top level as a concatenated string.
        rank_tier = extract_rank_tier(raw)
        est = estimate_stats(ps_raw, level, age, rank=rank_tier)
        total = int(est.get("estimated_total") or 0)
        return total, ps_raw
    except Exception as exc:
        logger.warning("compute_ff: personalstats fetch failed for pid=%d: %s", player_id, exc)
        return 0, {}


async def _caller_total_from_keystore(torn_client, key_store, caller_id: int) -> int:
    """Best-effort total for the *caller*.

    Priority:
    1. Caller has a registered API key → fetch their real battlestats via
       ``fetch_training_data`` (sums the four real stats; exact).
    2. Fall back to personalstats heuristic (same path as the target).

    Returns 0 if both paths fail — caller code will treat 0 as "use 1" in
    the formula.
    """
    if key_store is None or torn_client is None:
        return 0
    entry = key_store.get_key(caller_id) if hasattr(key_store, "get_key") else None
    if entry and entry.get("api_key"):
        try:
            data = await torn_client.fetch_training_data(entry["api_key"])
            if data and "battlestats" in data:
                bs = data["battlestats"]
                total = int(
                    (bs.get("strength", 0) or 0)
                    + (bs.get("defense", 0) or 0)
                    + (bs.get("speed", 0) or 0)
                    + (bs.get("dexterity", 0) or 0)
                )
                if total > 0:
                    return total
        except Exception as exc:
            logger.warning("compute_ff: caller battlestats fetch failed for pid=%d: %s", caller_id, exc)
    # Fall through: heuristic on caller's personalstats.
    total, _ = await _fetch_personalstats_total(torn_client, caller_id)
    return total


async def compute_ff(
    player_id: int,
    caller_id: int,
    torn_client,
    key_store,
    *,
    spy_service=None,
    stats_repo=None,
    now: int | None = None,
    ttl_seconds: int = FF_TTL_SECONDS,
) -> dict:
    """Compute a fair-fight score for *player_id* relative to *caller_id*.

    Returns a dict shaped like the API response:
        {score, dom_stat, source, computed_at, expires_at}

    ``source`` is ``"spy"`` when we have per-stat spy data for the target
    (any source: tornstats / yata / member_submit / faction_snapshot) AND
    a caller total we trust. Otherwise we fall back to the personalstats
    heuristic and tag ``source = "formula"``.

    Note: this function NEVER touches ``ff_repo`` — caching is the caller's
    responsibility (router does cache check → compute_ff → upsert). Keeps
    the function pure-ish and easy to test.
    """
    if now is None:
        now = int(time.time())

    target_total = 0
    spy_est = None
    if spy_service is not None:
        try:
            est = spy_service.repo.get_estimate(player_id)
            if est and (est.get("total") or 0) > 0:
                spy_est = est
                target_total = int(est["total"])
        except Exception as exc:
            logger.warning("compute_ff: spy lookup failed for pid=%d: %s", player_id, exc)

    # Faction-snapshot fallback for the target — TM members rarely have spy
    # data on them, but we have exact stats from their own API key.
    if spy_est is None and stats_repo is not None:
        try:
            snap = stats_repo.get_latest_snapshot(player_id)
            if snap and (snap.get("total") or 0) > 0:
                spy_est = {
                    "strength": snap.get("strength", 0),
                    "defense": snap.get("defense", 0),
                    "speed": snap.get("speed", 0),
                    "dexterity": snap.get("dexterity", 0),
                    "total": snap.get("total", 0),
                }
                target_total = int(snap["total"])
        except Exception as exc:
            logger.warning("compute_ff: stat_snapshot lookup failed for pid=%d: %s", player_id, exc)

    if spy_est is not None and target_total > 0:
        caller_total = await _caller_total_from_keystore(torn_client, key_store, caller_id)
        score = _ff_formula(target_total, caller_total)
        dom_stat = _dom_stat_from_spy(spy_est)
        return {
            "score": score,
            "dom_stat": dom_stat,
            "source": "spy",
            "computed_at": now,
            "expires_at": now + ttl_seconds,
        }

    # Formula fallback: estimate both target and caller from personalstats.
    target_total, target_ps = await _fetch_personalstats_total(torn_client, player_id)
    caller_total = await _caller_total_from_keystore(torn_client, key_store, caller_id)
    score = _ff_formula(target_total, caller_total)
    dom_stat = _dom_stat_from_personalstats(target_ps)
    return {
        "score": score,
        "dom_stat": dom_stat,
        "source": "formula",
        "computed_at": now,
        "expires_at": now + ttl_seconds,
    }
