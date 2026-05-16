"""Pure functions for activity tracker (Phase 3A).

This module is intentionally side-effect free: bin math, 7x24 aggregation, and
the "most active 4-hour window" calculator live here so the scheduler job and
the read API can both rely on them without pulling in DB or HTTP state.

Time semantics
--------------
- All inputs/outputs use UTC unix timestamps. The heatmap and window
  calculations bucket by UTC weekday/hour, not the viewer's local time —
  callers that want local-time display must rotate the matrix themselves.
- Bin size is 5 minutes (300 seconds). A bin's "online_seconds" is at most
  300 (one tick), but the storage layer sums repeated ticks so re-runs of the
  same scheduler cycle are idempotent.
"""
from __future__ import annotations

from datetime import datetime, timezone

BIN_SIZE_SECONDS: int = 300  # 5 minutes
WINDOW_HOURS: int = 4


def bin_start_for(timestamp: int) -> int:
    """Floor *timestamp* to the start of its 5-minute bin.

    The returned value is always divisible by ``BIN_SIZE_SECONDS`` so two ticks
    that land in the same bin produce the same key — that's what makes
    ``ActivityRepository.add_bin`` safely idempotent on retry.
    """
    return int(timestamp) - (int(timestamp) % BIN_SIZE_SECONDS)


def aggregate_heatmap(bins: list[tuple[int, int]]) -> list[list[int]]:
    """Aggregate a stream of ``(bin_start, online_seconds)`` rows into a 7x24
    weekday-by-hour matrix in UTC.

    Output shape: ``matrix[weekday][hour]`` where ``weekday`` is 0=Monday..6=Sunday
    (Python's ``datetime.weekday()``) and ``hour`` is 0..23. Values are summed
    across all dates in the input — so 14 days of bins collapses to a single
    "what does this player's typical week look like" picture.
    """
    matrix: list[list[int]] = [[0] * 24 for _ in range(7)]
    for bin_start, online_seconds in bins:
        dt = datetime.fromtimestamp(int(bin_start), tz=timezone.utc)
        matrix[dt.weekday()][dt.hour] += int(online_seconds)
    return matrix


def most_active_window(heatmap: list[list[int]]) -> tuple[int, int]:
    """Return ``(start_hour, end_hour)`` of the contiguous 4-hour UTC window
    with the highest total activity across all 7 days.

    Algorithm: sum the 7-day column per hour, then slide a 4-hour window
    across the resulting 24-vector and pick the maximum sum; ties resolve to
    the earliest window. ``end_hour`` is the hour *after* the last included
    hour (e.g. window 2-6 covers 02:00, 03:00, 04:00, 05:00 — so 06:00 is the
    first hour NOT in the window). This keeps formatting as ``"02:00-06:00"``
    a one-liner for the caller.
    """
    hourly_totals: list[int] = [0] * 24
    for day in heatmap:
        for hour, value in enumerate(day):
            hourly_totals[hour] += int(value)

    best_start = 0
    best_sum = -1
    for start in range(24):
        # Wrap around midnight: window may straddle 22:00-02:00.
        window_sum = sum(hourly_totals[(start + offset) % 24] for offset in range(WINDOW_HOURS))
        if window_sum > best_sum:
            best_sum = window_sum
            best_start = start
    return best_start, (best_start + WINDOW_HOURS) % 24


def format_window(start_hour: int, end_hour: int) -> str:
    """Render ``(start_hour, end_hour)`` as ``"HH:00-HH:00 UTC"`` for the API."""
    return f"{start_hour:02d}:00-{end_hour:02d}:00 UTC"
