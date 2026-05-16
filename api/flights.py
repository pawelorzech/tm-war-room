"""Pure flight-tracking logic (FFScouter parity, Phase 2A).

This module is intentionally side-effect-free: no DB, no HTTP, no clock
calls. The scheduler job (`api/scheduler/jobs/flights.py`) and the route
handlers (`api/routers/flights.py`) wrap these helpers with state.

Three responsibilities live here:

1. ``predict_landing`` — given a known ``departed_at`` + destination + ticket
   class, return the unix timestamp the player should hit the ground. The
   data table (``FLIGHT_DURATIONS_SECONDS``) mirrors the in-game Travel
   Agency UI; see ``docs/torn-flight-times.md``.
2. ``classify_ticket_class`` — given an observed in-air duration, pick the
   ticket class that fits best. Used after we see a `Traveling → Okay`
   transition to backfill the row that was opened on departure with a
   speculative ``"standard"``.
3. ``detect_transition`` — pure state-machine over Torn `status.state`
   values. ``"Okay" → "Traveling" | "Abroad"`` is a departure, the reverse
   is a landing, everything else is noise (Hospital, Jail, Federal, etc.).

Keeping these as pure functions means the unit tests can exercise the full
state machine without spinning up the scheduler / mocking httpx.
"""
from __future__ import annotations

from typing import Literal

# Country key → ticket class → one-way duration in seconds.
# Source: in-game Travel Agency UI as of 2026-05 (see docs/torn-flight-times.md).
# Country keys are the lowercased English name with underscores so that they
# survive `_normalize_destination()` cleanly.
FLIGHT_DURATIONS_SECONDS: dict[str, dict[str, int]] = {
    "mexico":         {"standard":  1560, "business":  780, "wlt":   936},
    "cayman_islands": {"standard":  2100, "business": 1050, "wlt":  1260},
    "canada":         {"standard":  2460, "business": 1230, "wlt":  1476},
    "hawaii":         {"standard":  8100, "business": 4050, "wlt":  4860},
    "united_kingdom": {"standard":  9540, "business": 4770, "wlt":  5724},
    "argentina":      {"standard": 10500, "business": 5250, "wlt":  6300},
    "switzerland":    {"standard": 10800, "business": 5400, "wlt":  6480},
    "japan":          {"standard": 13500, "business": 6750, "wlt":  8100},
    "china":          {"standard": 14400, "business": 7200, "wlt":  8640},
    "uae":            {"standard": 16200, "business": 8100, "wlt":  9720},
    "south_africa":   {"standard": 17820, "business": 8910, "wlt": 10692},
}

# Torn occasionally spells these differently in `status.description`
# ("Traveling to UK", "In Cayman Islands", "Returning from UAE"). The
# normalizer below maps every variant we've seen to a canonical key.
_DESTINATION_ALIASES: dict[str, str] = {
    "mexico": "mexico",
    "cayman": "cayman_islands",
    "cayman_islands": "cayman_islands",
    "cayman islands": "cayman_islands",
    "canada": "canada",
    "hawaii": "hawaii",
    "uk": "united_kingdom",
    "united_kingdom": "united_kingdom",
    "united kingdom": "united_kingdom",
    "britain": "united_kingdom",
    "argentina": "argentina",
    "switzerland": "switzerland",
    "japan": "japan",
    "china": "china",
    "uae": "uae",
    "united arab emirates": "uae",
    "south africa": "south_africa",
    "south_africa": "south_africa",
}

TicketClass = Literal["standard", "business", "wlt", "book"]
Transition = Literal["departed", "landed", "none"]

# Torn `status.state` values that mean "the player is in the air or on
# foreign soil right now". `Abroad` is the post-landing label; `Returning`
# is the trip back home. From our tracker's point of view they all count
# as "currently away from Torn City".
_AWAY_STATES = frozenset({"Traveling", "Abroad", "Returning"})


def _normalize_destination(raw: str) -> str:
    """Lowercase + collapse-whitespace + alias lookup. Returns input lowercased
    if no alias matches — callers fall back to ``"standard"`` math in that
    case rather than crashing on a typo from upstream."""
    if not raw:
        return ""
    key = " ".join(raw.lower().split()).replace("-", " ")
    return _DESTINATION_ALIASES.get(key, key.replace(" ", "_"))


def predict_landing(departed_at: int, destination: str, ticket_class: str) -> int:
    """Return the predicted unix timestamp the flight lands.

    Unknown destinations or ticket classes fall back to a Mexico-standard
    duration (1560 s) — a deliberately small guess so the UI still shows
    *something* without crashing the scheduler tick. The classifier's
    refinement on landing will eventually replace it with the real number.
    """
    canonical = _normalize_destination(destination)
    durations = FLIGHT_DURATIONS_SECONDS.get(canonical)
    if durations is None:
        return int(departed_at) + 1560
    # `book` flights match the fastest legitimate duration today — see docs note.
    cls = ticket_class if ticket_class in durations else (
        "business" if ticket_class == "book" else "standard"
    )
    return int(departed_at) + int(durations[cls])


def classify_ticket_class(observed_duration_seconds: int, destination: str) -> TicketClass:
    """Pick the ticket class whose canonical duration is closest to what we
    observed.

    Tolerances: Torn's status polling + our 60 s scheduler cadence means the
    measured duration can drift by up to ~120 s in either direction. We pick
    the nearest class by absolute delta among the three legitimate classes
    (``standard``, ``business``, ``wlt``) and only emit ``"book"`` for
    *suspiciously short* flights — below the **fastest** legitimate
    duration by > 60 s. The Travel Book item produces a flight whose
    duration equals the fastest paid option (typically business), so the
    sentinel only fires if Torn introduces a faster mode in the future.
    """
    canonical = _normalize_destination(destination)
    durations = FLIGHT_DURATIONS_SECONDS.get(canonical)
    if durations is None or observed_duration_seconds <= 0:
        return "standard"

    fastest = min(durations[c] for c in ("standard", "business", "wlt"))
    if observed_duration_seconds < fastest - 60:
        # Faster than the fastest paid option — record as `book` sentinel
        # so we notice the anomaly rather than silently floor it.
        return "book"

    best: TicketClass = "standard"
    best_delta: int | None = None
    for cls in ("standard", "business", "wlt"):
        delta = abs(observed_duration_seconds - durations[cls])
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best = cls  # type: ignore[assignment]
    return best


def detect_transition(prev_status: str, curr_status: str) -> Transition:
    """Pure two-state-string state machine.

    Inputs are raw Torn ``status.state`` strings — ``"Okay"``,
    ``"Traveling"``, ``"Abroad"``, ``"Returning"``, ``"Hospital"``,
    ``"Jail"``, ``"Federal"``, etc. Empty prev is treated as ``"Okay"`` so
    the very first observation of a player who is already flying still
    fires a ``"departed"`` edge.

    Returns:
      * ``"departed"`` — was on the ground (`Okay`/`Hospital`/`Jail`/...)
        and is now in the air or already abroad.
      * ``"landed"`` — was away and is now ``"Okay"`` specifically.
        Transitions to Hospital/Jail/Federal from a Traveling state are
        treated as ``"none"`` — those are interruptions, not landings, and
        we'd rather under-count landings than fabricate a landing
        timestamp at the wrong moment (which would poison ticket-class
        classification).
      * ``"none"`` — anything else, including mid-flight phase changes
        (Traveling→Abroad, Abroad→Returning) and post-flight non-Okay
        states.
    """
    prev = (prev_status or "Okay").strip() or "Okay"
    curr = (curr_status or "Okay").strip() or "Okay"
    if prev == curr:
        return "none"
    was_away = prev in _AWAY_STATES
    is_away = curr in _AWAY_STATES
    if not was_away and is_away:
        return "departed"
    if was_away and not is_away and curr == "Okay":
        return "landed"
    return "none"


def parse_destination_from_description(description: str) -> str:
    """Extract destination from a Torn ``status.description``.

    Torn formats look like:
      * ``"Traveling to Mexico"``
      * ``"In Mexico"`` / ``"In Cayman Islands"``
      * ``"Returning to Torn from Mexico"``

    Returns the canonical destination key (e.g. ``"mexico"``) or ``""`` if no
    country can be parsed — the caller then falls back to leaving the row's
    destination as whatever we last knew.
    """
    if not description:
        return ""
    low = description.lower()
    for marker in (" to ", " from ", " in "):
        idx = low.find(marker)
        if idx == -1:
            continue
        tail = low[idx + len(marker):].strip()
        # Strip a trailing "torn" (e.g. "Returning to Torn from Mexico"
        # produces tail="torn from mexico"); fall through to second pass.
        if tail.startswith("torn"):
            rest = tail[4:].lstrip()
            if rest.startswith("from"):
                tail = rest[4:].strip()
            else:
                continue
        # Drop anything after a stray space-separated tail word.
        canonical = _normalize_destination(tail)
        if canonical in FLIGHT_DURATIONS_SECONDS:
            return canonical
    # Last-ditch: look for any known country name as a substring.
    for alias, canonical in _DESTINATION_ALIASES.items():
        if alias in low:
            return canonical
    return ""
