"""Pure, server-side bucketing + range computation for spy estimates.

`bucket_and_range()` is the single source of truth for how a (source, age,
heuristic confidence) tuple maps to a user-facing trust bucket and the
total-stat range that should be displayed. No I/O, no DB, no fetches —
deterministic and exhaustively unit-tested in tests/test_spy_display.py.

The bucket logic is keyed on `source` (not `confidence`) because the
upstream `confidence` label is emitted inconsistently across spy sources
— tornstats/yata always end up as 'estimate' even when freshly fetched,
while only faction_snapshot ≤7d ever produces 'exact'. Using `source`
+ `age_days` directly gives a UI bucket that matches the actual data
trustworthiness rather than which upstream label happened to be applied.
"""
from __future__ import annotations

from typing import Literal

Bucket = Literal["verified", "estimate", "rough_guess"]

# Real spy sources — verified when fresh, estimate when older.
_REAL_SPY_SOURCES = frozenset({"faction_snapshot", "tornstats", "yata"})

# Width % for heuristic confidence (rough_guess paths).
_HEURISTIC_WIDTH = {
    "medium": 30,
    "low": 50,
    "very low": 100,
}


def bucket_and_range(
    source: str,
    age_days: int | None,
    total: int,
    heuristic_conf: str | None = None,
) -> tuple[Bucket, tuple[int, int], int]:
    """Classify a spy estimate and compute its display range.

    Args:
        source: Upstream spy source — 'faction_snapshot', 'tornstats',
            'yata', 'estimated', 'none', or any other string (treated as
            unknown/rough).
        age_days: Days since the report was recorded. None means unknown
            age — treated as old/stale to be cautious.
        total: The reported total battle stats. Used to compute the range.
        heuristic_conf: When source='estimated', the stat_estimator's own
            confidence ('medium' | 'low' | 'very low'). None means
            no confidence info, treated as widest range.

    Returns:
        (bucket, (low, high), width_pct).

    See tests/test_spy_display.py for the exhaustive decision table.
    """
    width_pct = _width_pct(source, age_days, heuristic_conf)
    bucket = _bucket(source, age_days)
    low, high = _range_from_width(total, width_pct)
    return bucket, (low, high), width_pct


def _bucket(source: str, age_days: int | None) -> Bucket:
    if source in _REAL_SPY_SOURCES:
        if age_days is not None and age_days <= 7:
            return "verified"
        return "estimate"
    # 'estimated', 'none', or any unknown source → rough_guess
    return "rough_guess"


def _width_pct(source: str, age_days: int | None, heuristic_conf: str | None) -> int:
    if source in _REAL_SPY_SOURCES:
        if age_days is None:
            return 25  # unknown age → cautious
        if age_days <= 7:
            return 0
        if age_days <= 30:
            return 10
        return 25
    # rough_guess paths — width by heuristic_conf, falling back to widest
    if source == "estimated" and heuristic_conf in _HEURISTIC_WIDTH:
        return _HEURISTIC_WIDTH[heuristic_conf]
    return 100


def _range_from_width(total: int, width_pct: int) -> tuple[int, int]:
    if width_pct == 0:
        return total, total
    spread = total * width_pct // 100
    return max(0, total - spread), total + spread
