"""Tests for the pure mug-score function in api/mug_score.py."""
from api.mug_score import MugSignals, MugScore, compute_mug_score


class TestWinnability:
    def test_much_weaker_target_scores_prime(self):
        sig = MugSignals(
            caller_total=10_000_000, target_total=2_000_000,
            networth=6_000_000_000, property_type="Palace",
            travel_destination="Cayman Islands", casino_activity=1,
            last_action_status="Idle",
        )
        result = compute_mug_score(sig)
        assert result.score == 80
        assert result.tier == "prime"
        assert result.hittable_now is True
        assert result.breakdown["winnability"] == 30.0
        assert result.breakdown["money"] == 30.0
        assert result.breakdown["availability"] == 20.0

    def test_stronger_target_scores_skip(self):
        sig = MugSignals(
            caller_total=2_000_000, target_total=10_000_000,
            networth=50_000_000, last_action_status="Offline",
        )
        result = compute_mug_score(sig)
        assert result.tier == "skip"
        assert result.score < 30

    def test_unknown_target_stats_neutral(self):
        sig = MugSignals(caller_total=10_000_000, target_total=0)
        assert compute_mug_score(sig).breakdown["winnability"] == 12.0


class TestAvailability:
    def test_hospital_zeroes_availability_and_not_hittable(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, in_hospital=True)
        result = compute_mug_score(sig)
        assert result.breakdown["availability"] == 0.0
        assert result.hittable_now is False

    def test_abroad_not_hittable(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, is_abroad=True)
        assert compute_mug_score(sig).hittable_now is False

    def test_idle_beats_online(self):
        base = dict(caller_total=10_000_000, target_total=2_000_000)
        idle = compute_mug_score(MugSignals(**base, last_action_status="Idle"))
        online = compute_mug_score(MugSignals(**base, last_action_status="Online"))
        assert idle.breakdown["availability"] > online.breakdown["availability"]


class TestCooldown:
    def test_cooldown_quarters_score_and_blocks(self):
        base = dict(
            caller_total=10_000_000, target_total=2_000_000,
            networth=6_000_000_000, property_type="Palace",
            travel_destination="Cayman Islands", casino_activity=1,
            last_action_status="Idle",
        )
        full = compute_mug_score(MugSignals(**base))
        cd = compute_mug_score(MugSignals(**base, mug_cooldown_remaining_h=10.0))
        assert cd.score == int(full.score * 0.25)
        assert cd.tier == "cooldown"
        assert cd.hittable_now is False
        assert cd.breakdown["cooldown_remaining_h"] == 10.0


class TestFreshCash:
    def test_fresh_trade_full_boost(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, fresh_cash_age_min=0.0)
        assert compute_mug_score(sig).breakdown["fresh_cash"] == 10.0

    def test_fresh_trade_half_decay(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, fresh_cash_age_min=30.0)
        assert compute_mug_score(sig).breakdown["fresh_cash"] == 5.0

    def test_fresh_trade_expired(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, fresh_cash_age_min=60.0)
        assert compute_mug_score(sig).breakdown["fresh_cash"] == 0.0

    def test_no_trade_no_boost(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, fresh_cash_age_min=None)
        assert compute_mug_score(sig).breakdown["fresh_cash"] == 0.0

    def test_fresh_trade_negative_age_no_boost(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, fresh_cash_age_min=-5.0)
        assert compute_mug_score(sig).breakdown["fresh_cash"] == 0.0


class TestPoker:
    def test_big_stack_bonus(self):
        sig = MugSignals(caller_total=10_000_000, target_total=2_000_000, poker_big_stack=True)
        assert compute_mug_score(sig).breakdown["poker"] == 10.0


class TestTierBoundaries:
    def test_good_and_meh_tiers(self):
        # good band (50-69): win 30 + avail 20 (Idle) + money 2 = 52
        good = compute_mug_score(MugSignals(
            caller_total=10_000_000, target_total=2_000_000,
            networth=50_000_000, last_action_status="Idle",
        ))
        assert 50 <= good.score < 70
        assert good.tier == "good"

        # meh band (30-49): win 30 + avail 8 (Offline) + money 2 = 40
        meh = compute_mug_score(MugSignals(
            caller_total=10_000_000, target_total=2_000_000,
            networth=50_000_000, last_action_status="Offline",
        ))
        assert 30 <= meh.score < 50
        assert meh.tier == "meh"
