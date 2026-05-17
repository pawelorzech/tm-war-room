"""Tests for api.services.spy_display.bucket_and_range — pure decision logic."""
from __future__ import annotations

import pytest

from api.services.spy_display import bucket_and_range


# Source x age → bucket + width (the locked-in decision table)
@pytest.mark.parametrize(
    ("source", "age_days", "heuristic_conf", "expected_bucket", "expected_width"),
    [
        # Verified: any real-spy source AND age ≤ 7
        ("faction_snapshot", 0, None, "verified", 0),
        ("faction_snapshot", 7, None, "verified", 0),
        ("tornstats", 3, None, "verified", 0),
        ("yata", 7, None, "verified", 0),
        ("member_submit", 0, None, "verified", 0),
        ("member_submit", 7, None, "verified", 0),
        # Estimate (real-spy source, 8–30 days)
        ("faction_snapshot", 8, None, "estimate", 10),
        ("tornstats", 15, None, "estimate", 10),
        ("yata", 30, None, "estimate", 10),
        ("member_submit", 20, None, "estimate", 10),
        # Estimate (real-spy source, >30 days — backend's "stale" lives here)
        ("faction_snapshot", 31, None, "estimate", 25),
        ("tornstats", 60, None, "estimate", 25),
        ("yata", 365, None, "estimate", 25),
        ("member_submit", 90, None, "estimate", 25),
        # Rough guess (heuristic source) — width by heuristic_conf
        ("estimated", 0, "medium", "rough_guess", 30),
        ("estimated", 0, "low", "rough_guess", 50),
        ("estimated", 0, "very low", "rough_guess", 100),
        ("estimated", 0, None, "rough_guess", 100),  # missing conf → most cautious
        # Rough guess (no source — faction list "unknown" path)
        ("none", None, None, "rough_guess", 100),
        # Defensive fallthrough: any unknown source goes to rough_guess
        ("future-source-we-haven't-seen", 5, None, "rough_guess", 100),
    ],
)
def test_bucket_and_range_decision_table(
    source: str,
    age_days: int | None,
    heuristic_conf: str | None,
    expected_bucket: str,
    expected_width: int,
) -> None:
    bucket, _range, width = bucket_and_range(
        source=source, age_days=age_days, total=1_000_000_000, heuristic_conf=heuristic_conf
    )
    assert bucket == expected_bucket
    assert width == expected_width


def test_verified_range_is_exact_no_spread() -> None:
    """width=0% means low == high == total."""
    _bucket, (low, high), _width = bucket_and_range(
        source="faction_snapshot", age_days=2, total=5_234_567_890
    )
    assert low == 5_234_567_890
    assert high == 5_234_567_890


def test_estimate_10pct_spread() -> None:
    _bucket, (low, high), _width = bucket_and_range(
        source="tornstats", age_days=15, total=5_000_000_000
    )
    # ±10% of 5B = 4.5B to 5.5B
    assert low == 4_500_000_000
    assert high == 5_500_000_000


def test_rough_guess_100pct_spread() -> None:
    _bucket, (low, high), _width = bucket_and_range(
        source="estimated", age_days=0, total=5_000_000_000, heuristic_conf="very low"
    )
    # ±100% of 5B = 0 to 10B
    assert low == 0
    assert high == 10_000_000_000


def test_low_clamped_to_zero() -> None:
    """A small total with wide spread must not go negative."""
    _bucket, (low, _high), _width = bucket_and_range(
        source="estimated", age_days=0, total=100_000_000, heuristic_conf="very low"
    )
    assert low == 0


def test_total_zero_yields_zero_range() -> None:
    """Faction-list 'unknown' members hit this — total=0, source='none'."""
    bucket, (low, high), _width = bucket_and_range(
        source="none", age_days=None, total=0
    )
    assert bucket == "rough_guess"
    assert low == 0
    assert high == 0


def test_boundary_age_7_is_verified() -> None:
    bucket, _r, _w = bucket_and_range(source="tornstats", age_days=7, total=1_000)
    assert bucket == "verified"


def test_boundary_age_8_is_estimate() -> None:
    bucket, _r, width = bucket_and_range(source="tornstats", age_days=8, total=1_000)
    assert bucket == "estimate"
    assert width == 10


def test_boundary_age_30_is_10pct() -> None:
    _b, _r, width = bucket_and_range(source="tornstats", age_days=30, total=1_000)
    assert width == 10


def test_boundary_age_31_is_25pct() -> None:
    _b, _r, width = bucket_and_range(source="tornstats", age_days=31, total=1_000)
    assert width == 25


def test_none_age_days_treated_as_old() -> None:
    """When the upstream layer can't compute age, fall back to widest estimate window."""
    _b, _r, width = bucket_and_range(source="tornstats", age_days=None, total=1_000)
    assert width == 25


# --- Endgame bucket (added 2026-05-17) -------------------------------------
#
# Endgame triggers ONLY when source='estimated' (heuristic fallback) AND
# rank ∈ {Heroic, Legendary, Elite, Invincible} AND level >= 95.
# Returns bucket='endgame' with (None, None) range — no number to display.

@pytest.mark.parametrize("tier", ["Heroic", "Legendary", "Elite", "Invincible"])
def test_endgame_bucket_for_all_endgame_ranks(tier: str) -> None:
    bucket, total_range, width = bucket_and_range(
        source="estimated", age_days=0, total=10_000_000_000,
        heuristic_conf="medium", rank=tier, level=99,
    )
    assert bucket == "endgame"
    assert total_range == (None, None)
    assert width == 0


def test_endgame_bucket_at_level_95_boundary() -> None:
    """Boundary: level=95 (inclusive) trips the endgame bucket."""
    bucket, _r, _w = bucket_and_range(
        source="estimated", age_days=0, total=5_000_000_000,
        heuristic_conf="medium", rank="Invincible", level=95,
    )
    assert bucket == "endgame"


def test_no_endgame_below_level_95() -> None:
    """Invincible at L80 → rough_guess as usual, NOT endgame (defensive — should be impossible in real Torn)."""
    bucket, total_range, width = bucket_and_range(
        source="estimated", age_days=0, total=5_000_000_000,
        heuristic_conf="medium", rank="Invincible", level=80,
    )
    assert bucket == "rough_guess"
    # Normal numeric range applies
    assert total_range != (None, None)
    assert width == 30  # medium heuristic


def test_no_endgame_for_non_endgame_rank() -> None:
    """'Highly Respected' (below Heroic in the ladder) → rough_guess, NOT endgame."""
    bucket, _r, width = bucket_and_range(
        source="estimated", age_days=0, total=2_000_000_000,
        heuristic_conf="low", rank="Highly Respected", level=100,
    )
    assert bucket == "rough_guess"
    assert width == 50  # low heuristic


def test_no_endgame_for_real_spy_source() -> None:
    """Fresh tornstats spy of an Invincible L100 → verified (we have real data), NOT endgame."""
    bucket, _r, width = bucket_and_range(
        source="tornstats", age_days=2, total=100_000_000_000,
        heuristic_conf=None, rank="Invincible", level=100,
    )
    assert bucket == "verified"
    assert width == 0


def test_no_endgame_when_rank_missing() -> None:
    """Without rank info (None) → fall back to standard rough_guess path."""
    bucket, total_range, width = bucket_and_range(
        source="estimated", age_days=0, total=5_000_000_000,
        heuristic_conf="medium", rank=None, level=100,
    )
    assert bucket == "rough_guess"
    assert total_range != (None, None)
    assert width == 30


def test_endgame_bucket_overrides_heuristic_width() -> None:
    """Endgame trumps heuristic confidence — width is forced to 0 (no range)."""
    bucket, total_range, width = bucket_and_range(
        source="estimated", age_days=0, total=8_000_000_000,
        heuristic_conf="very low", rank="Invincible", level=100,
    )
    assert bucket == "endgame"
    assert width == 0
    assert total_range == (None, None)


def test_existing_callsites_unaffected_by_default_args() -> None:
    """Callers that don't pass rank/level get the pre-2026-05-17 behaviour."""
    bucket, total_range, width = bucket_and_range(
        source="estimated", age_days=0, total=5_000_000_000, heuristic_conf="medium",
    )
    assert bucket == "rough_guess"
    assert width == 30
    assert total_range != (None, None)
