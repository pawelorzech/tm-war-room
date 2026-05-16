"""Pure-function tests for api.activity (Phase 3A)."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from api.activity import (
    BIN_SIZE_SECONDS,
    aggregate_heatmap,
    bin_start_for,
    format_window,
    most_active_window,
)


# ── bin_start_for ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "ts,expected",
    [
        (0, 0),
        (1, 0),
        (299, 0),
        (300, 300),
        (301, 300),
        (1234567890, 1234567890 - (1234567890 % 300)),
    ],
)
def test_bin_start_for_floors_to_5min_grid(ts, expected):
    assert bin_start_for(ts) == expected


def test_bin_start_for_is_always_divisible_by_bin_size():
    # 200 randomly-placed timestamps must all round to multiples of 300.
    for offset in range(0, 6000, 37):
        result = bin_start_for(1_700_000_000 + offset)
        assert result % BIN_SIZE_SECONDS == 0


def test_bin_start_for_idempotent_on_aligned_input():
    aligned = bin_start_for(1_700_000_000)
    assert bin_start_for(aligned) == aligned


# ── aggregate_heatmap ────────────────────────────────────────────────


def _ts(year, month, day, hour, minute=0) -> int:
    """Build a UTC unix ts for a known (weekday, hour) cell."""
    return int(datetime(year, month, day, hour, minute, tzinfo=timezone.utc).timestamp())


def test_aggregate_heatmap_empty_input_returns_zeros():
    matrix = aggregate_heatmap([])
    assert len(matrix) == 7
    assert all(len(row) == 24 for row in matrix)
    assert sum(sum(row) for row in matrix) == 0


def test_aggregate_heatmap_routes_to_correct_weekday_and_hour():
    # 2026-01-05 is a Monday (weekday=0). 14:23 UTC → bucket [0][14].
    bin_start = _ts(2026, 1, 5, 14, 23)
    matrix = aggregate_heatmap([(bin_start, 300)])
    assert matrix[0][14] == 300
    # Every other cell stays zero.
    matrix[0][14] = 0
    assert sum(sum(row) for row in matrix) == 0


def test_aggregate_heatmap_sums_within_same_cell():
    # Two bins in the same Monday 14:00 hour stack up.
    matrix = aggregate_heatmap([
        (_ts(2026, 1, 5, 14, 0), 300),
        (_ts(2026, 1, 5, 14, 5), 300),
    ])
    assert matrix[0][14] == 600


def test_aggregate_heatmap_spans_weekdays():
    # Monday 14:00 and Sunday 23:00 (weekday=6) hit different rows.
    matrix = aggregate_heatmap([
        (_ts(2026, 1, 5, 14, 0), 300),   # Mon
        (_ts(2026, 1, 11, 23, 0), 200),  # Sun
    ])
    assert matrix[0][14] == 300
    assert matrix[6][23] == 200


# ── most_active_window ───────────────────────────────────────────────


def test_most_active_window_picks_4h_block_with_max_sum():
    # All activity concentrated 14:00-17:59 → window 14-18.
    heatmap = [[0] * 24 for _ in range(7)]
    for hour in range(14, 18):
        heatmap[0][hour] = 1000
    start, end = most_active_window(heatmap)
    assert (start, end) == (14, 18)


def test_most_active_window_sums_across_weekdays():
    # Spread the same total across every day at hour 20 → still picks 20-24.
    heatmap = [[0] * 24 for _ in range(7)]
    for day in range(7):
        for hour in range(20, 24):
            heatmap[day][hour] = 50
    start, end = most_active_window(heatmap)
    assert (start, end) == (20, 0)  # wraps to 00:00 of next day


def test_most_active_window_ties_resolve_to_earliest():
    # Two identical 4-hour blocks at 02:00 and 14:00 → pick 02:00.
    heatmap = [[0] * 24 for _ in range(7)]
    for hour in range(2, 6):
        heatmap[0][hour] = 100
    for hour in range(14, 18):
        heatmap[0][hour] = 100
    start, end = most_active_window(heatmap)
    assert (start, end) == (2, 6)


def test_most_active_window_handles_zero_heatmap():
    # No activity at all → falls back to window starting at 00:00.
    heatmap = [[0] * 24 for _ in range(7)]
    start, end = most_active_window(heatmap)
    assert (start, end) == (0, 4)


def test_format_window_renders_two_digit_hours():
    assert format_window(2, 6) == "02:00-06:00 UTC"
    assert format_window(20, 0) == "20:00-00:00 UTC"
