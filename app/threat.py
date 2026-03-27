from __future__ import annotations
import math
from app.models import PersonalStats


def compute_threat(stats: PersonalStats | None, level: int) -> tuple[int, str]:
    if stats is None:
        return 0, "unknown"

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
