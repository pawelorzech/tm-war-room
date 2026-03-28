from __future__ import annotations
import math
from api.models import PersonalStats


def compute_threat(stats: PersonalStats | None, level: int, baseline: PersonalStats | None = None) -> tuple[int, str]:
    """Compute threat score 0-100.

    If baseline (your stats) is provided, score is RELATIVE — how enemy compares to you.
    If no baseline, score is absolute (legacy behavior).
    """
    if stats is None:
        return 0, "unknown"

    if baseline:
        return _relative_threat(stats, level, baseline)
    return _absolute_threat(stats, level)


def _relative_threat(enemy: PersonalStats, level: int, me: PersonalStats) -> tuple[int, str]:
    """Compare enemy to your stats. Score 0-100 where 50 = equal to you."""

    def ratio(enemy_val: int, my_val: int) -> float:
        if my_val <= 0:
            return 2.0 if enemy_val > 0 else 1.0
        return enemy_val / my_val

    # Training intensity (weight: 35)
    xan_r = ratio(enemy.xanax_taken, me.xanax_taken)
    refill_r = ratio(enemy.refills, me.refills)
    damage_r = ratio(enemy.damage_done, me.damage_done)
    training = ((xan_r + refill_r + damage_r) / 3) * 35

    # Combat record (weight: 35)
    atk_r = ratio(enemy.attacks_won, me.attacks_won)
    def_r = ratio(enemy.defends_won, me.defends_won)
    streak_r = ratio(enemy.best_kill_streak, me.best_kill_streak)
    combat = ((atk_r + def_r + streak_r) / 3) * 35

    # Resources (weight: 15)
    nw_r = ratio(enemy.networth, me.networth)
    resources = nw_r * 15

    # Level (weight: 15)
    level_r = level / 100
    power = level_r * 15

    # Ratios average around 1.0 when equal → raw ≈ 50 when equal
    raw = (training + combat + resources + power) / 2
    score = min(100, max(0, int(raw)))

    if score < 20:
        label = "easy"
    elif score < 50:
        label = "medium"
    elif score < 75:
        label = "hard"
    else:
        label = "avoid"

    return score, label


def compute_stat_threat(enemy_stats: dict, own_stats: dict) -> tuple[int, str]:
    """Compare battle stats directly for accurate threat scoring."""
    enemy_total = enemy_stats.get("total", 0)
    own_total = own_stats.get("total", 0)
    if own_total == 0:
        return 50, "medium"
    ratio = enemy_total / own_total
    if ratio < 0.3:
        return max(5, int(ratio * 30)), "easy"
    elif ratio < 0.7:
        return int(20 + (ratio - 0.3) * 75), "medium"
    elif ratio < 1.2:
        return int(50 + (ratio - 0.7) * 50), "hard"
    else:
        return min(100, int(75 + (ratio - 1.2) * 30)), "avoid"


def _absolute_threat(stats: PersonalStats, level: int) -> tuple[int, str]:
    """Absolute scoring (no baseline). Fallback when no faction key owner stats."""
    xan_score = min(10, stats.xanax_taken / 500)
    refill_score = min(10, stats.refills / 300)
    se_score = min(5, stats.stat_enhancers_used / 10)
    damage_score = min(10, stats.damage_done / 5_000_000)
    training = xan_score + refill_score + se_score + damage_score

    wins_score = min(15, stats.attacks_won / 1000)
    streak_score = min(5, stats.best_kill_streak / 40)
    best_dmg_score = min(5, stats.best_damage / 1800)
    defend_score = min(5, stats.defends_won / 400)
    combat = wins_score + streak_score + best_dmg_score + defend_score

    level_score = min(10, level / 8)
    beaten_score = min(10, stats.highest_beaten / 8)
    power = level_score + beaten_score

    nw_score = min(15, stats.networth / 1_000_000_000)
    resources = nw_score

    raw = training + combat + power + resources
    score = min(100, max(0, math.ceil(raw)))

    if score < 30:
        label = "easy"
    elif score < 60:
        label = "medium"
    elif score < 85:
        label = "hard"
    else:
        label = "avoid"

    return score, label
