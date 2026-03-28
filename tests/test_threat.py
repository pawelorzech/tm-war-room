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
