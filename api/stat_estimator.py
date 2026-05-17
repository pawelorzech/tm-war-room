"""Estimate battle stats from personalstats data.

Uses known Torn mechanics to estimate total battle stats from activity metrics.
This is a rough estimate — actual stats depend on gym choice, happy, books, etc.

Key formulas:
- Each gym train uses 5 energy, gains ~proportional to gym level and happy
- Xanax gives 250 energy = ~50 trains
- Refill gives 150 energy = ~30 trains
- Energy drinks give varying amounts
- Average gain per train at max gym with 5000 happy ≈ 10-50k per train depending on total stats

The avg_gain_per_train ladder and rank-tier floors were CALIBRATED empirically
on 2026-05-17 against 34 ground-truth faction-member snapshots plus 21 live
probes of endgame players (rank Heroic+). Source: combined dataset in
``Plans/stat-estimator-calibration-2026-05-17.md``.

Phase 1 calibration (2026-05-17) lowered the mid-tier ladder values dramatically
(8000 → 500, 3000 → 30, 1000 → 5) because the original ladder over-estimated
typical L30-70 players by 100-1000x. It also added a rank-based floor for
endgame players (rank ≥ Heroic, level ≥ 95) so we never publish an obviously
too-small estimate for those tiers — the floor is the p5 real_total observed
in the calibration set.
"""
from __future__ import annotations


# Rank tiers eligible for SE-uncap + rank-floor logic. Each tier's floor is the
# p5 real_total observed in the endgame probe (n=5/1/7/8 — Legendary is weak).
ENDGAME_RANKS = frozenset({"Heroic", "Legendary", "Elite", "Invincible"})

# Empirical p5 real_total per rank tier (level ≥ 95).
# See Plans/stat-estimator-calibration-2026-05-17.md, "Rank-tier floor" table.
RANK_FLOOR: dict[str, int] = {
    "Heroic": 2_410_237_505,      # n=5 endgame probes
    "Legendary": 3_643_767_248,   # n=1, low confidence
    "Elite": 2_160_064_567,       # n=7
    "Invincible": 2_311_999_708,  # n=8
}


def estimate_stats(
    personalstats: dict,
    level: int = 0,
    days_old: int = 0,
    rank: str | None = None,
) -> dict:
    """Estimate total battle stats from personalstats.

    Args:
        personalstats: Raw personalstats dict (flat v1 shape — xantaken,
            refills, statenhancersused, etc.).
        level: Player level. Used for the rank-floor gate (only applied at
            ``level >= 95``).
        days_old: Account age in days. Used for natural-energy estimation.
            Falls back to a level-based estimate when 0.
        rank: Rank tier string (e.g. ``"Invincible"``, ``"Heroic"``). When the
            tier is in :data:`ENDGAME_RANKS` the SE boost is uncapped and the
            tier-specific floor in :data:`RANK_FLOOR` is applied. When None
            (or unknown tier) no rank-based logic kicks in.

    Returns:
        dict with ``estimated_total``, ``confidence``, ``breakdown``, ``inputs``.
    """
    xanax = personalstats.get("xantaken", 0) or 0
    refills = personalstats.get("refills", 0) or 0
    se_used = personalstats.get("statenhancersused", 0) or 0
    ecstasy = personalstats.get("exttaken", 0) or 0
    energy_drinks = personalstats.get("energydrinkused", 0) or 0
    networth = personalstats.get("networth", 0) or 0
    attacks_won = personalstats.get("attackswon", 0) or 0
    defends_won = personalstats.get("defendswon", 0) or 0

    # Estimate total energy spent on gym training
    # Xanax: 250e each, Refill: 150e each, Ecstasy: 50e each
    # Natural energy: ~200e/day (with job perks avg)
    # Energy drinks: ~25e each average
    xanax_energy = xanax * 250
    refill_energy = refills * 150
    ecstasy_energy = ecstasy * 50
    drink_energy = energy_drinks * 25

    # Estimate account age from level if not provided
    if days_old <= 0 and level > 0:
        days_old = max(30, level * 15)  # rough: ~15 days per level

    natural_energy = days_old * 200  # Very rough

    total_energy = xanax_energy + refill_energy + ecstasy_energy + drink_energy + natural_energy
    total_trains = total_energy // 5  # 5 energy per train

    # Empirical avg_gain_per_train (median actual per xanax bracket, raport 2026-05-17)
    # Combined dataset n where measured; brackets above 5k extrapolate the top measured bucket.
    if xanax >= 5_000:
        avg_gain_per_train = 12_000    # n=9 combined, was 40_000 (over-estimated whales)
    elif xanax >= 2_000:
        avg_gain_per_train = 14_000    # n=16, was 20_000
    elif xanax >= 500:
        avg_gain_per_train = 500       # n=10, was 8_000 — DRAMATIC down for mid-tier
    elif xanax >= 100:
        avg_gain_per_train = 30        # n=15, was 3_000 — DRAMATIC down for low-tier
    else:
        avg_gain_per_train = 5         # n=5, was 1_000 — DRAMATIC down for new accounts

    estimated_total = int(total_trains * avg_gain_per_train)

    # Stat enhancers boost: each SE gives ~0.2% boost. Cap at +200% for normal
    # players (raised from +50% — empirical observation, raport 2026-05-17).
    # For endgame ranks (Heroic+) the cap is removed entirely: Akenomics has
    # SE=2837 = +567% boost which the +50% cap completely buried.
    if se_used > 0:
        if rank in ENDGAME_RANKS:
            se_boost = se_used * 0.002  # uncapped — endgame whales have 2k+ SE
        else:
            se_boost = min(se_used * 0.002, 2.0)
        estimated_total = int(estimated_total * (1 + se_boost))

    # Rank-tier floor: applied only when rank ∈ ENDGAME_RANKS AND level ≥ 95.
    # When applied the heuristic falls back to a p5 floor — confidence is
    # forced to 'low' because the number is a heuristic floor, not a measurement.
    rank_floor_applied = False
    if rank in RANK_FLOOR and level >= 95:
        floor = RANK_FLOOR[rank]
        if estimated_total < floor:
            estimated_total = floor
            rank_floor_applied = True

    # Confidence based on data quality. Floor-applied estimates downgrade to
    # 'low' because the number is the floor, not the heuristic result.
    if rank_floor_applied:
        confidence = "low"
    elif xanax > 100 and refills > 50:
        confidence = "medium"
    elif xanax > 10:
        confidence = "low"
    else:
        confidence = "very low"

    return {
        "estimated_total": estimated_total,
        "confidence": confidence,
        "breakdown": {
            "xanax_energy": xanax_energy,
            "refill_energy": refill_energy,
            "natural_energy": natural_energy,
            "total_energy": total_energy,
            "total_trains": total_trains,
            "avg_gain_per_train": avg_gain_per_train,
            "rank_floor_applied": rank_floor_applied,
        },
        "inputs": {
            "xanax": xanax,
            "refills": refills,
            "se_used": se_used,
            "level": level,
            "days_estimate": days_old,
            "rank": rank,
        },
    }
