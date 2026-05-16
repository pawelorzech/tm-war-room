from api.models import PersonalStats
from api.threat import compute_threat


def test_easy_target():
    stats = PersonalStats(xanax_taken=100, refills=10, attacks_won=200, defends_won=10,
                           networth=500_000_000, highest_beaten=60, best_damage=2000,
                           best_kill_streak=10, damage_done=500_000)
    score, label = compute_threat(stats, level=30)
    assert score < 30
    assert label == "easy"


def test_medium_target():
    stats = PersonalStats(xanax_taken=1000, refills=300, attacks_won=2000, defends_won=100,
                           networth=3_000_000_000, highest_beaten=85, best_damage=4000,
                           best_kill_streak=50, damage_done=5_000_000)
    score, label = compute_threat(stats, level=65)
    assert 30 <= score < 60
    assert label == "medium"


def test_hard_target():
    stats = PersonalStats(xanax_taken=3000, refills=1500, stat_enhancers_used=10,
                           attacks_won=8000, defends_won=500, networth=8_000_000_000,
                           highest_beaten=100, best_damage=7000, best_kill_streak=100,
                           damage_done=20_000_000)
    score, label = compute_threat(stats, level=95)
    assert 60 <= score < 85
    assert label == "hard"


def test_avoid_target():
    stats = PersonalStats(xanax_taken=5000, refills=3000, stat_enhancers_used=50,
                           attacks_won=15000, defends_won=2000, networth=15_000_000_000,
                           highest_beaten=100, best_damage=9000, best_kill_streak=200,
                           damage_done=50_000_000)
    score, label = compute_threat(stats, level=100)
    assert score >= 85
    assert label == "avoid"


def test_no_stats():
    score, label = compute_threat(None, level=50)
    assert label == "unknown"


def test_score_capped():
    stats = PersonalStats(xanax_taken=99999, refills=99999, stat_enhancers_used=999,
                           attacks_won=99999, defends_won=99999, networth=99_000_000_000,
                           highest_beaten=100, best_damage=99999, best_kill_streak=9999,
                           damage_done=999_000_000)
    score, label = compute_threat(stats, level=100)
    assert score <= 100


# --- Relative-threat path: compute_threat called WITH a baseline (your stats) ---
# These dispatch to _relative_threat(enemy, level, me). Previously only the
# absolute path was exercised — all 6 tests above pass `compute_threat(stats, level)`
# without baseline. Below covers ratio-based scoring, including the my_val<=0
# guard that returns 2.0 (enemy has stat) or 1.0 (both zero).


def _mid_stats() -> PersonalStats:
    """A representative 'middle of the pack' player used as either side."""
    return PersonalStats(
        xanax_taken=1000, refills=300, stat_enhancers_used=5,
        attacks_won=2000, defends_won=100, best_kill_streak=40,
        best_damage=3000, highest_beaten=85, networth=3_000_000_000,
        damage_done=5_000_000,
    )


def test_relative_threat_equal_stats_lands_around_midband():
    me = _mid_stats()
    enemy = _mid_stats()
    score, label = compute_threat(enemy, level=50, baseline=me)
    # Equal ratios → training/combat/resources sum to ~85, plus level component
    # (50/100)*15 = 7.5, raw/2 ≈ 46. Label band: 20..50 → "medium".
    assert 35 <= score <= 55
    assert label == "medium"


def test_relative_threat_much_stronger_enemy_is_avoid():
    me = _mid_stats()
    # Roughly 5x stronger across every ratio-relevant field.
    enemy = PersonalStats(
        xanax_taken=5000, refills=1500, stat_enhancers_used=50,
        attacks_won=10000, defends_won=500, best_kill_streak=200,
        best_damage=6000, highest_beaten=100, networth=15_000_000_000,
        damage_done=25_000_000,
    )
    score, label = compute_threat(enemy, level=90, baseline=me)
    assert score >= 75
    assert label == "avoid"


def test_relative_threat_much_weaker_enemy_is_easy():
    me = _mid_stats()
    # Order of magnitude weaker across the board.
    enemy = PersonalStats(
        xanax_taken=50, refills=10, stat_enhancers_used=0,
        attacks_won=100, defends_won=5, best_kill_streak=3,
        best_damage=500, highest_beaten=50, networth=100_000_000,
        damage_done=200_000,
    )
    score, label = compute_threat(enemy, level=15, baseline=me)
    assert score < 20
    assert label == "easy"


def test_relative_threat_my_zero_baseline_caps_ratio():
    # Guard: ratio() returns 2.0 when my_val <= 0 and enemy_val > 0.
    # So a brand-new player with zeroed baseline facing an active enemy
    # should still see meaningful (capped) threat, not a divide-by-zero crash.
    me = PersonalStats()  # all zeros
    enemy = _mid_stats()
    score, label = compute_threat(enemy, level=50, baseline=me)
    # Every ratio caps at 2.0 → training/combat/resources max out.
    # raw = ((70 + 70 + 30 + 7.5) / 2) = ~88.75 → score 88 → "avoid".
    assert score >= 75
    assert label == "avoid"


def test_relative_threat_both_zero_neither_player_active():
    # ratio() returns 1.0 when both sides are zero — treat as equal.
    me = PersonalStats()
    enemy = PersonalStats()
    score, label = compute_threat(enemy, level=10, baseline=me)
    # All ratios = 1.0, level=10 → (35+35+15+1.5)/2 ≈ 43 → "medium".
    assert 30 <= score <= 50
    assert label == "medium"


def test_relative_threat_dispatches_separately_from_absolute():
    # Same stats, same level — but providing baseline should change the score
    # by routing through the relative-threat path. Sanity check the dispatch
    # at compute_threat itself rather than only testing the leaf.
    stats = _mid_stats()
    abs_score, _ = compute_threat(stats, level=50)            # absolute path
    rel_score, _ = compute_threat(stats, level=50, baseline=stats)  # relative
    # Absolute uses caps + weighted bonuses; relative uses ratios.
    # They're computed by different formulas so the two scores should differ,
    # protecting against a future refactor that accidentally collapses both
    # branches into the same body.
    assert abs_score != rel_score
