"""Estimate battle stats from personalstats data.

Uses known Torn mechanics to estimate total battle stats from activity metrics.
This is a rough estimate — actual stats depend on gym choice, happy, books, etc.

Key formulas:
- Each gym train uses 5 energy, gains ~proportional to gym level and happy
- Xanax gives 250 energy = ~50 trains
- Refill gives 150 energy = ~30 trains
- Energy drinks give varying amounts
- Average gain per train at max gym with 5000 happy ≈ 10-50k per train depending on total stats

This uses the same approach as YATA's stat estimation.
"""
from __future__ import annotations


def estimate_stats(personalstats: dict, level: int = 0, days_old: int = 0) -> dict:
    """Estimate total battle stats from personalstats.

    Returns dict with estimated total, confidence, and breakdown.
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

    # Stat gain per train varies enormously by gym level, happy, and current stats
    # At low stats: ~500 per train
    # At mid stats (100M total): ~5,000 per train
    # At high stats (1B total): ~50,000 per train
    # We use a logarithmic model based on training volume

    # Base estimate: assume average 3,000 stat gain per train (mid-range player)
    # Adjust based on training intensity indicators
    if xanax > 5000:
        avg_gain_per_train = 40_000  # Heavy trainer, likely at top gym
    elif xanax > 2000:
        avg_gain_per_train = 20_000
    elif xanax > 500:
        avg_gain_per_train = 8_000
    elif xanax > 100:
        avg_gain_per_train = 3_000
    else:
        avg_gain_per_train = 1_000

    estimated_total = int(total_trains * avg_gain_per_train)

    # Stat enhancers boost: each SE gives ~10% boost on top
    if se_used > 0:
        se_boost = min(se_used * 0.002, 0.5)  # Cap at 50% boost
        estimated_total = int(estimated_total * (1 + se_boost))

    # Confidence based on data quality
    if xanax > 100 and refills > 50:
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
        },
        "inputs": {
            "xanax": xanax,
            "refills": refills,
            "se_used": se_used,
            "level": level,
            "days_estimate": days_old,
        },
    }
