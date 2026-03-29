"""Tests for estimate_stats() from api/stat_estimator.py."""
import pytest
from api.stat_estimator import estimate_stats


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
        """Player with <100 xanax should use 1,000 gain per train."""
        stats = {"xantaken": 50, "refills": 10}
        result = estimate_stats(stats, level=10, days_old=200)
        assert result["breakdown"]["avg_gain_per_train"] == 1_000
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
        stats = {"xantaken": 600, "refills": 200}
        result = estimate_stats(stats, days_old=500)
        assert result["breakdown"]["avg_gain_per_train"] == 8_000
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
        stats = {"xantaken": 3000, "refills": 1000}
        result = estimate_stats(stats, days_old=1000)
        assert result["breakdown"]["avg_gain_per_train"] == 20_000
        assert result["confidence"] == "medium"

    def test_very_high_xanax_uses_top_gain(self):
        stats = {"xantaken": 6000, "refills": 2000}
        result = estimate_stats(stats, days_old=1500)
        assert result["breakdown"]["avg_gain_per_train"] == 40_000
        assert result["confidence"] == "medium"

    def test_heavy_trainer_total_is_large(self):
        stats = {"xantaken": 6000, "refills": 2000}
        result = estimate_stats(stats, days_old=1500)
        # Should be in the billions
        assert result["estimated_total"] > 1_000_000_000


class TestEstimateStatsSEBoost:
    def test_se_boost_increases_total(self):
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 50}
        result_no_se = estimate_stats({"xantaken": 600, "refills": 200}, days_old=500)
        result_with_se = estimate_stats(stats, days_old=500)
        assert result_with_se["estimated_total"] > result_no_se["estimated_total"]

    def test_se_boost_proportional(self):
        """SE boost = min(se_used * 0.002, 0.5), applied as (1 + boost) multiplier."""
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 100}
        result = estimate_stats(stats, days_old=500)
        # 100 * 0.002 = 0.2 -> 20% boost
        stats_no_se = {"xantaken": 600, "refills": 200}
        result_base = estimate_stats(stats_no_se, days_old=500)
        expected = int(result_base["estimated_total"] * 1.2)
        assert result["estimated_total"] == expected

    def test_se_boost_capped_at_50_percent(self):
        """SE boost should not exceed 50%."""
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 500}
        result = estimate_stats(stats, days_old=500)
        # 500 * 0.002 = 1.0 but capped at 0.5
        stats_no_se = {"xantaken": 600, "refills": 200}
        result_base = estimate_stats(stats_no_se, days_old=500)
        expected = int(result_base["estimated_total"] * 1.5)
        assert result["estimated_total"] == expected

    def test_zero_se_no_boost(self):
        stats = {"xantaken": 600, "refills": 200, "statenhancersused": 0}
        result = estimate_stats(stats, days_old=500)
        stats_omitted = {"xantaken": 600, "refills": 200}
        result2 = estimate_stats(stats_omitted, days_old=500)
        assert result["estimated_total"] == result2["estimated_total"]


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
                     "total_energy", "total_trains", "avg_gain_per_train"):
            assert key in breakdown

    def test_inputs_reflect_passed_values(self):
        result = estimate_stats({"xantaken": 123, "refills": 45, "statenhancersused": 6},
                                level=50, days_old=700)
        assert result["inputs"]["xanax"] == 123
        assert result["inputs"]["refills"] == 45
        assert result["inputs"]["se_used"] == 6
        assert result["inputs"]["level"] == 50
        assert result["inputs"]["days_estimate"] == 700


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
