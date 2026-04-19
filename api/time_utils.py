"""Time helpers for TCT (Torn City Time = UTC) week anchoring.

Torn's internal rolling stats don't reset on a calendar boundary, but our
comparison logic (per Steven AP feedback) anchors the "week" to Monday 18:00 TCT.
Anything before Mon 18:00 of a given ISO week belongs to the previous anchored week.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

# 18:00 TCT on Monday. TCT is defined as UTC.
WEEK_ANCHOR_WEEKDAY = 0  # Monday (datetime.weekday())
WEEK_ANCHOR_HOUR = 18


def week_start_tct(dt: datetime | None = None) -> int:
    """Return unix timestamp of the Monday 18:00 TCT that starts the anchored
    week containing *dt* (defaults to now).

    Examples (TCT = UTC):
      * dt = Mon 17:59 TCT  → previous Monday 18:00 TCT
      * dt = Mon 18:00 TCT  → this Monday 18:00 TCT
      * dt = Wed 12:00 TCT  → this week's Monday 18:00 TCT
      * dt = Sun 23:59 TCT  → previous Monday 18:00 TCT
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    # Start from this week's Monday 00:00
    this_monday_midnight = (dt - timedelta(days=dt.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    this_anchor = this_monday_midnight.replace(hour=WEEK_ANCHOR_HOUR)
    if dt < this_anchor:
        this_anchor -= timedelta(days=7)
    return int(this_anchor.timestamp())


def week_end_tct(week_start_ts: int) -> int:
    """Return unix timestamp of the end of the anchored week beginning at *week_start_ts*
    (exclusive = start of the NEXT anchored week)."""
    return week_start_ts + 7 * 86400


def format_week_label(week_start_ts: int) -> str:
    """Human-readable label like '2025-W43 (Oct 20)' for UI display."""
    dt = datetime.fromtimestamp(week_start_ts, tz=timezone.utc)
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d} ({dt.strftime('%b %d')})"
