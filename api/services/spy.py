from __future__ import annotations
from datetime import datetime, timedelta, timezone
from api.db.repos.spies import SpyRepository

SOURCE_PRIORITY = {"member_submit": 0, "tornstats": 1, "yata": 1}


def _parse_dt(s: str) -> datetime:
    """Parse ISO datetime string; always returns timezone-aware (UTC) datetime."""
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def spy_reported_at(timestamp, fallback_iso: str) -> str:
    """Convert a spy source's ``timestamp`` (epoch seconds) to an ISO string.

    Both TornStats and YATA return the time the actual spy was performed as
    a Unix epoch int. We use that as ``reported_at`` so our staleness logic
    reflects when the spy *happened*, not when we last queried the source —
    otherwise a year-old spy on TornStats keeps looking fresh because we
    keep re-fetching the same row.

    Falls back to ``fallback_iso`` (usually fetch-time) if the source
    omitted the timestamp or returned a non-positive value.
    """
    if not timestamp:
        return fallback_iso
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return fallback_iso
    if ts <= 0:
        return fallback_iso
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return fallback_iso
def is_real_spy(data) -> bool:
    """Reject "estimate-only" or partial spy responses.

    A real spy carries five numbers: total + all four per-stat. TornStats sometimes
    returns an algorithmic estimate (no real spy exists, only a level-based total
    guess) where per-stat are the literal string "N/A", AND sometimes a partial
    response where 1-3 of the four per-stat are "N/A" with the rest real. `_num`
    in torn_client coerces non-numerics to 0 at the parser boundary; this guard
    then rejects any row missing the full breakdown — storing a row with even one
    zero per-stat next to a real total still misleads the UI ("strength = 0?").

    refresh_estimate falls back to YATA, the faction snapshot, or the personalstats
    heuristic — all of which produce a complete per-stat breakdown or are honest
    about being a single-number estimate.
    """
    if not data:
        return False
    total = data.get("total", 0) or 0
    if total <= 0:
        return False
    for field in ("strength", "defense", "speed", "dexterity"):
        if (data.get(field, 0) or 0) <= 0:
            return False
    return True


EXACT_MAX_AGE_DAYS = 7
FRESH_MAX_AGE_DAYS = 30

class SpyService:
    def __init__(self, repo: SpyRepository):
        self.repo = repo

    def refresh_estimate(self, player_id: int) -> None:
        reports = self.repo.get_reports(player_id)
        if not reports:
            return
        now = datetime.now(timezone.utc)
        best = None
        best_priority = 999
        best_age = 999
        for r in reports:
            reported_at = _parse_dt(r["reported_at"])
            age_days = (now - reported_at).total_seconds() / 86400
            source = r["source"]
            priority = SOURCE_PRIORITY.get(source, 10)
            if source == "member_submit" and age_days > EXACT_MAX_AGE_DAYS:
                priority = 10
            if priority < best_priority or (priority == best_priority and age_days < best_age):
                best = r
                best_priority = priority
                best_age = age_days
        if best is None:
            return
        reported_at = _parse_dt(best["reported_at"])
        age_days = (now - reported_at).total_seconds() / 86400
        if best["source"] == "member_submit" and age_days <= EXACT_MAX_AGE_DAYS:
            confidence = "exact"
        elif age_days <= FRESH_MAX_AGE_DAYS:
            confidence = "estimate"
        else:
            confidence = "stale"
        # If the chosen (highest-priority) report has no name, salvage one from any
        # other report for this player — member_submit reports never carry a name,
        # so without this they overwrite the estimate's name with NULL.
        chosen_name = best["player_name"]
        if not chosen_name:
            for r in reports:
                if r["player_name"]:
                    chosen_name = r["player_name"]
                    break
        self.repo.update_estimate(
            player_id=player_id, player_name=chosen_name, source=best["source"],
            strength=best["strength"], defense=best["defense"], speed=best["speed"],
            dexterity=best["dexterity"], total=best["total"], confidence=confidence,
            reported_at=best["reported_at"],
        )
