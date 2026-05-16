"""Unit tests for compute_stat_threat — direct battle-stat comparison threat scoring.

Covers all branches of the ratio-based scoring in api/threat.py:64.
"""
import pytest

from api.threat import compute_stat_threat


def test_own_total_zero_returns_medium_default():
    """Zero-div guard: no own stats → unknown matchup, default to medium/50."""
    score, label = compute_stat_threat({"total": 1_000_000}, {"total": 0})
    assert score == 50
    assert label == "medium"


def test_own_total_zero_with_zero_enemy_still_medium():
    """Zero-div guard fires before ratio is computed — both zero is still medium/50."""
    score, label = compute_stat_threat({"total": 0}, {"total": 0})
    assert score == 50
    assert label == "medium"


def test_missing_total_keys_treated_as_zero():
    """Missing 'total' key defaults to 0 (dict.get default) → zero-div guard triggers."""
    score, label = compute_stat_threat({}, {})
    assert score == 50
    assert label == "medium"


def test_enemy_zero_own_positive_floors_at_easy_5():
    """ratio=0 → easy branch, max(5, 0) = 5."""
    score, label = compute_stat_threat({"total": 0}, {"total": 1000})
    assert score == 5
    assert label == "easy"


@pytest.mark.parametrize(
    "enemy_total,own_total,expected_score,expected_label",
    [
        # --- easy branch (ratio < 0.3) ---
        # ratio = 0.2 → max(5, int(0.2*30)) = max(5, 6) = 6
        (100, 500, 6, "easy"),
        # ratio = 0.02 → max(5, int(0.02*30)) = max(5, 0) = 5 (floor enforced)
        (10, 500, 5, "easy"),
        # --- medium branch (0.3 <= ratio < 0.7) ---
        # ratio = 0.5 → int(20 + 0.2*75) = int(35.0) = 35
        (500, 1000, 35, "medium"),
        # boundary: ratio = 0.3 exactly → not < 0.3, falls to medium
        # int(20 + 0*75) = 20
        (300, 1000, 20, "medium"),
        # --- hard branch (0.7 <= ratio < 1.2) ---
        # ratio = 1.0 → int(50 + 0.3*50) = int(65.0) = 65
        (1000, 1000, 65, "hard"),
        # boundary: ratio = 0.7 exactly → not < 0.7, falls to hard
        # int(50 + 0*50) = 50
        (700, 1000, 50, "hard"),
        # --- avoid branch (ratio >= 1.2) ---
        # ratio = 1.5 → min(100, int(75 + 0.3*30)) = min(100, 84) = 84
        (1500, 1000, 84, "avoid"),
        # boundary: ratio = 1.2 exactly → falls to avoid (else branch)
        # min(100, int(75 + 0*30)) = 75
        (1200, 1000, 75, "avoid"),
        # avoid cap: ratio = 10.0 → min(100, int(75 + 8.8*30)) = min(100, 339) = 100
        (10000, 1000, 100, "avoid"),
    ],
)
def test_compute_stat_threat_branches(enemy_total, own_total, expected_score, expected_label):
    """Branch + boundary coverage for the four ratio bands."""
    score, label = compute_stat_threat({"total": enemy_total}, {"total": own_total})
    assert score == expected_score, f"ratio={enemy_total / own_total}: expected score {expected_score}, got {score}"
    assert label == expected_label
