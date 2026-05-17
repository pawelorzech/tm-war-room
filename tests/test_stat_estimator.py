"""Tests for estimate_stats() from api/stat_estimator.py.

The empirical thresholds were recalibrated 2026-05-17 — see
``Plans/stat-estimator-calibration-2026-05-17.md`` for the source data.
"""
import pytest
from api.stat_estimator import estimate_stats, RANK_FLOOR, ENDGAME_RANKS


class TestEstimateStatsZero:
    def test_empty_dict_returns_zero_total(self):
        result = estimate_stats({})
        assert result["estimated_total"] == 0
        assert result["confidence"] == "very low"

    def test_all_zeros_returns_zero_total(self):
        stats = {
            "xantaken": 0, "refills": 0, "statenhancersused": 0,
            "exttaken": 0, "energydrinkused": 0,
        }
        result = estimate_stats(stats, level=0, days_old=0)
        assert result["estimated_total"] == 0
        assert result["breakdown"]["total_energy"] == 0
        assert result["breakdown"]["total_trains"] == 0

    def test_none_values_treated_as_zero(self):
        stats = {
            "xantaken": None, "refills": None, "statenhancersused": None,
            "exttaken": None, "energydrinkused": None, "networth": None,
        }
        result = estimate_stats(stats)
        assert result["estimated_total"] == 0


class TestEstimateStatsLowTrainer:
    def test_low_xanax_uses_low_gain(self):
        """Player with <100 xanax should use 5 gain per train (was 1000)."""
        stats = {"xantaken": 50, "refills": 10}
        result = estimate_stats(stats, level=10, days_old=200)
        assert result["breakdown"]["avg_gain_per_train"] == 5
        assert result["confidence"] == "low"

    def test_natural_energy_from_days(self):
        """With 0 drugs but days_old set, natural energy drives estimate."""
        stats = {"xantaken": 0, "refills": 0}
        result = estimate_stats(stats, days_old=100)
        assert result["breakdown"]["natural_energy"] == 100 * 200
        assert result["breakdown"]["total_energy"] == 100 * 200

    def test_level_used_to_estimate_days_if_not_provided(self):
        stats = {"xantaken": 5}
        result = estimate_stats(stats, level=20, days_old=0)
        # days_old should be estimated as max(30, 20*15) = 300
        assert result["inputs"]["days_estimate"] == 300
        assert result["breakdown"]["natural_energy"] == 300 * 200


class TestEstimateStatsMediumTrainer:
    def test_medium_xanax_uses_medium_gain(self):
        """Player with 500-2000 xanax should use 500 gain (was 8000) — recalibrated 2026-05-17."""
        stats = {"xantaken": 600, "refills": 200}
        result = estimate_stats(stats, days_old=500)
        assert result["breakdown"]["avg_gain_per_train"] == 500
        assert result["confidence"] == "medium"

    def test_energy_calculation_components(self):
        stats = {"xantaken": 600, "refills": 200, "exttaken": 100, "energydrinkused": 40}
        result = estimate_stats(stats, days_old=0)
        breakdown = result["breakdown"]
        assert breakdown["xanax_energy"] == 600 * 250
        assert breakdown["refill_energy"] == 200 * 150
        expected_total = 600 * 250 + 200 * 150 + 100 * 50 + 40 * 25
        assert breakdown["total_energy"] == expected_total
        assert breakdown["total_trains"] == expected_total // 5


class TestEstimateStatsHeavyTrainer:
    def test_high_xanax_uses_high_gain(self):
        """2k-5k xanax → 14_000 gain (was 20_000) — recalibrated 2026-05-17."""
        stats = {"xantaken": 3000, "refills": 1000}
        result = estimate_stats(stats, days_old=1000)
        assert result["breakdown"]["avg_gain_per_train"] == 14_000
        assert result["confidence"] == "medium"

    def test_very_high_xanax_uses_top_gain(self):
        """5k+ xanax → 12_000 gain (was 40_000) — recalibrated 2026-05-17."""
        stats = {"xantaken": 6000, "refills": 2000}
        result = estimate_stats(stats, days_old=1500)
        assert result["breakdown"]["avg_gain_per_train"] == 12_000
        assert result["confidence"] == "medium"

    def test_heavy_trainer_total_is_large(self):
        stats = {"xantaken": 6000, "refills": 2000}
        result = estimate_stats(stats, days_old=1500)
        # Should still be in the billions even after recalibration
        assert result["estimated_total"] > 1_000_000_000


class TestEstimateStatsXanaxBracketBoundaries:
    """Validate inclusive boundary at each xanax-bracket cutoff (>= comparisons)."""

    @pytest.mark.parametrize(
        ("xanax", "expected_gain"),
        [
            (5_000, 12_000),   # 5k boundary, top bucket
            (4_999, 14_000),   # just below → 2k bucket
            (2_000, 14_000),   # 2k boundary
            (1_999, 500),      # just below → 500 bucket
            (500, 500),        # 500 boundary
            (499, 30),         # just below → 100 bucket
            (100, 30),         # 100 boundary
            (99, 5),           # just below → entry bucket
            (0, 5),            # zero
        ],
    )
    def test_bracket_boundary(self, xanax, expected_gain):
        stats = {"xantaken": xanax, "refills": 0}
        result = estimate_stats(stats, days_old=300)
        assert result["breakdown"]["avg_gain_per_train"] == expected_gain


class TestEstimateStatsSEBoost:
    def test_se_boost_increases_total(self):
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 50}
        result_no_se = estimate_stats({"xantaken": 600, "refills": 200}, days_old=500)
        result_with_se = estimate_stats(stats, days_old=500)
        assert result_with_se["estimated_total"] > result_no_se["estimated_total"]

    def test_se_boost_proportional(self):
        """SE boost = min(se_used * 0.002, 2.0), applied as (1 + boost) multiplier."""
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 100}
        result = estimate_stats(stats, days_old=500)
        # 100 * 0.002 = 0.2 -> 20% boost
        stats_no_se = {"xantaken": 600, "refills": 200}
        result_base = estimate_stats(stats_no_se, days_old=500)
        expected = int(result_base["estimated_total"] * 1.2)
        assert result["estimated_total"] == expected

    def test_se_boost_capped_at_200_percent(self):
        """SE boost capped at +200% for non-endgame players (was +50% pre-2026-05-17)."""
        # 1500 SE → 1500 * 0.002 = 3.0, capped at 2.0 → +200%
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 1500}
        result = estimate_stats(stats, days_old=500)
        stats_no_se = {"xantaken": 600, "refills": 200}
        result_base = estimate_stats(stats_no_se, days_old=500)
        expected = int(result_base["estimated_total"] * 3.0)  # 1.0 + 2.0 cap
        assert result["estimated_total"] == expected

    def test_se_boost_under_cap_unaffected(self):
        """SE below the new +200% cap behaves identically to pre-recalibration."""
        # 500 SE → 500 * 0.002 = 1.0 (under 2.0 cap) → +100%
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 500}
        result = estimate_stats(stats, days_old=500)
        stats_no_se = {"xantaken": 600, "refills": 200}
        result_base = estimate_stats(stats_no_se, days_old=500)
        expected = int(result_base["estimated_total"] * 2.0)  # 1.0 + 1.0
        assert result["estimated_total"] == expected

    def test_zero_se_no_boost(self):
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 0}
        result = estimate_stats(stats, days_old=500)
        stats_omitted = {"xantaken": 600, "refills": 200}
        result2 = estimate_stats(stats_omitted, days_old=500)
        assert result["estimated_total"] == result2["estimated_total"]


class TestEstimateStatsSEUncap:
    """SE cap is removed for rank ∈ ENDGAME_RANKS — endgame whales have 2k+ SE."""

    def test_invincible_se_uncapped(self):
        """Invincible + SE=2000 → boost is 4.0 (uncapped), not 2.0 (cap)."""
        stats = {"xantaken": 6000, "refills": 2000, "statenhancersused": 2000}
        # rank='Invincible' is endgame — cap should NOT apply
        result_endgame = estimate_stats(stats, level=100, days_old=1500, rank="Invincible")
        # Same SE with rank=None should hit the cap
        result_capped = estimate_stats(stats, level=100, days_old=1500, rank=None)
        # Without rank: boost capped at 2.0 → multiplier 3.0
        # With rank=Invincible: boost = 4.0 → multiplier 5.0
        # endgame should be (5.0 / 3.0) ~ 1.67x larger before any floor logic
        # But for a 6k xanax + 2k refills + 1500-day-old account the base is ~tens of billions,
        # so we just check endgame > capped strictly.
        assert result_endgame["estimated_total"] > result_capped["estimated_total"]

    @pytest.mark.parametrize("tier", ["Heroic", "Legendary", "Elite", "Invincible"])
    def test_all_endgame_ranks_uncapped(self, tier):
        stats = {"xantaken": 6000, "refills": 2000, "statenhancersused": 2000}
        result_endgame = estimate_stats(stats, level=100, days_old=1500, rank=tier)
        result_capped = estimate_stats(stats, level=100, days_old=1500, rank=None)
        assert result_endgame["estimated_total"] > result_capped["estimated_total"]

    def test_non_endgame_rank_still_capped(self):
        """A rank below the endgame floor (e.g. 'Professional') keeps the +200% cap."""
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 1500}
        result_pro = estimate_stats(stats, level=50, days_old=500, rank="Professional")
        result_none = estimate_stats(stats, level=50, days_old=500, rank=None)
        # Both go through the +200% cap path → identical output
        assert result_pro["estimated_total"] == result_none["estimated_total"]


class TestEstimateStatsRankFloor:
    """Rank floor applied only when rank ∈ RANK_FLOOR AND level >= 95."""

    def test_invincible_low_xanax_hits_floor(self):
        """Invincible + L100 + tiny base estimate → output >= RANK_FLOOR['Invincible']."""
        # A low-xanax Invincible (Achilleus pattern: SE=0, xanax=54)
        stats = {"xantaken": 54, "refills": 0, "statenhancersused": 0}
        result = estimate_stats(stats, level=100, days_old=7697, rank="Invincible")
        assert result["estimated_total"] >= RANK_FLOOR["Invincible"]
        assert result["breakdown"]["rank_floor_applied"] is True
        assert result["confidence"] == "low"  # floor downgrades confidence

    def test_heroic_low_estimate_hits_floor(self):
        stats = {"xantaken": 0, "refills": 0}
        result = estimate_stats(stats, level=99, days_old=2000, rank="Heroic")
        assert result["estimated_total"] >= RANK_FLOOR["Heroic"]
        assert result["breakdown"]["rank_floor_applied"] is True

    def test_floor_only_applies_at_level_95_plus(self):
        """Invincible at L80 (impossible in real Torn but defensive) → no floor."""
        # 80 xanax → bucket gain 5 → very small estimate
        stats = {"xantaken": 80, "refills": 0}
        result = estimate_stats(stats, level=80, days_old=1000, rank="Invincible")
        assert result["estimated_total"] < RANK_FLOOR["Invincible"]
        assert result["breakdown"]["rank_floor_applied"] is False

    def test_unknown_rank_no_floor(self):
        """'Highly Respected' is not in RANK_FLOOR → no floor applied even at L100."""
        stats = {"xantaken": 10, "refills": 0}
        result = estimate_stats(stats, level=100, days_old=3000, rank="Highly Respected")
        assert result["breakdown"]["rank_floor_applied"] is False
        # Confidence should NOT be forced to 'low' from rank logic
        # (with xanax=10, refills=0 the heuristic confidence path settles at 'very low')

    def test_high_estimate_unaffected_by_floor(self):
        """If the heuristic already produces > floor, floor is a no-op (estimate kept)."""
        stats = {"xantaken": 10000, "refills": 5000, "statenhancersused": 0}
        result_no_rank = estimate_stats(stats, level=100, days_old=2000, rank=None)
        result_inv = estimate_stats(stats, level=100, days_old=2000, rank="Invincible")
        # The Invincible run still gets the SE-uncap path (no SE here → no-op), but
        # without SE the totals should match because the estimate already exceeds the floor.
        assert result_inv["estimated_total"] >= result_no_rank["estimated_total"]
        # Floor not applied because estimate > floor
        assert result_inv["breakdown"]["rank_floor_applied"] is False

    def test_rank_none_no_floor(self):
        stats = {"xantaken": 5, "refills": 0}
        result = estimate_stats(stats, level=100, days_old=3000, rank=None)
        assert result["breakdown"]["rank_floor_applied"] is False

    @pytest.mark.parametrize("tier", ["Heroic", "Legendary", "Elite", "Invincible"])
    def test_each_endgame_tier_has_floor_entry(self, tier):
        assert tier in RANK_FLOOR
        assert tier in ENDGAME_RANKS
        assert RANK_FLOOR[tier] > 0


class TestEstimateStatsOutputStructure:
    def test_return_keys(self):
        result = estimate_stats({"xantaken": 10}, level=5)
        assert "estimated_total" in result
        assert "confidence" in result
        assert "breakdown" in result
        assert "inputs" in result

    def test_breakdown_keys(self):
        result = estimate_stats({"xantaken": 10}, level=5)
        breakdown = result["breakdown"]
        for key in ("xanax_energy", "refill_energy", "natural_energy",
                     "total_energy", "total_trains", "avg_gain_per_train",
                     "rank_floor_applied"):
            assert key in breakdown

    def test_inputs_reflect_passed_values(self):
        result = estimate_stats({"xantaken": 123, "refills": 45, "statenhancersused": 6},
                                level=50, days_old=700, rank="Professional")
        assert result["inputs"]["xanax"] == 123
        assert result["inputs"]["refills"] == 45
        assert result["inputs"]["se_used"] == 6
        assert result["inputs"]["level"] == 50
        assert result["inputs"]["days_estimate"] == 700
        assert result["inputs"]["rank"] == "Professional"

    def test_inputs_rank_defaults_to_none(self):
        result = estimate_stats({"xantaken": 100}, level=20)
        assert result["inputs"]["rank"] is None


class TestEstimateStatsConfidence:
    def test_medium_confidence(self):
        stats = {"xantaken": 200, "refills": 100}
        assert estimate_stats(stats)["confidence"] == "medium"

    def test_low_confidence(self):
        stats = {"xantaken": 50, "refills": 10}
        assert estimate_stats(stats)["confidence"] == "low"

    def test_very_low_confidence(self):
        stats = {"xantaken": 5, "refills": 0}
        assert estimate_stats(stats)["confidence"] == "very low"

    def test_floor_forces_low_confidence(self):
        """When the rank floor kicks in, confidence MUST be 'low' regardless of inputs."""
        # Heavy trainer at endgame rank but low SE → estimate may still trip the floor
        stats = {"xantaken": 200, "refills": 100}  # would be 'medium' without floor
        result = estimate_stats(stats, level=100, days_old=3000, rank="Invincible")
        if result["breakdown"]["rank_floor_applied"]:
            assert result["confidence"] == "low"
