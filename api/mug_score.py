"""Pure mug-score computation.

Mirrors api/threat.py: no I/O, dataclass in/out, fully unit-testable. The
caller (api/routers/mug.py) gathers the raw signals; this module only scores.

Cash-on-hand is hidden by Torn, so every money input here is a PROXY. The
score is advisory, never a claim of exact loot.
"""
from __future__ import annotations
from dataclasses import dataclass

CASH_COUNTRIES = {"Cayman Islands", "South Africa"}
RICH_PROPERTIES = {"Private Island", "Castle", "Palace"}
# Consumed by api/routers/mug.py to derive mug_cooldown_remaining_h; kept here as the single source of truth.
MUG_COOLDOWN_HOURS = 15.0
FRESH_CASH_WINDOW_MIN = 60.0


@dataclass
class MugSignals:
    caller_total: int = 0
    target_total: int = 0
    networth: int = 0
    property_type: str = ""
    travel_destination: str = ""        # "" when not traveling
    casino_activity: int = 0            # personalstats casino-plays proxy
    in_hospital: bool = False
    is_abroad: bool = False
    last_action_status: str = "Offline"  # "Online" | "Idle" | "Offline"
    mug_cooldown_remaining_h: float = 0.0
    fresh_cash_age_min: float | None = None
    poker_big_stack: bool = False


@dataclass
class MugScore:
    score: int
    tier: str            # "prime" | "good" | "meh" | "skip" | "cooldown"
    hittable_now: bool
    breakdown: dict


def _winnability(caller_total: int, target_total: int) -> float:
    """0..30. Rewards a target weaker than you (easy, reliable mug)."""
    if target_total <= 0:
        return 12.0  # unknown stats: neutral, slight caution
    ratio = caller_total / target_total  # >1 = you are stronger
    if ratio <= 1.0:
        return max(0.0, ratio * 10.0)    # equal/weaker-you maps 0..10
    return min(30.0, 10.0 + (ratio - 1.0) * 10.0)


def _money(sig: MugSignals) -> float:
    """0..30. Net worth tier + rich property + cash-country travel + casino."""
    nw = sig.networth
    if nw >= 5_000_000_000:
        nw_score = 18.0
    elif nw >= 1_000_000_000:
        nw_score = 12.0
    elif nw >= 100_000_000:
        nw_score = 6.0
    else:
        nw_score = 2.0
    prop_score = 6.0 if sig.property_type in RICH_PROPERTIES else 0.0
    travel_score = 4.0 if sig.travel_destination in CASH_COUNTRIES else 0.0
    casino_score = 2.0 if sig.casino_activity > 0 else 0.0
    return min(30.0, nw_score + prop_score + travel_score + casino_score)


def _availability(sig: MugSignals) -> float:
    """0..20. Hittable-right-now floats to the top; idle is ideal."""
    if sig.in_hospital or sig.is_abroad:
        return 0.0
    if sig.last_action_status == "Idle":
        return 20.0
    if sig.last_action_status == "Online":
        return 12.0
    return 8.0  # offline


def _fresh_cash(sig: MugSignals) -> float:
    """0..10 bonus, linear decay over FRESH_CASH_WINDOW_MIN minutes."""
    age = sig.fresh_cash_age_min
    if age is None or age < 0 or age >= FRESH_CASH_WINDOW_MIN:
        return 0.0
    return round(10.0 * (1.0 - age / FRESH_CASH_WINDOW_MIN), 1)


def _poker(sig: MugSignals) -> float:
    return 10.0 if sig.poker_big_stack else 0.0


def compute_mug_score(sig: MugSignals) -> MugScore:
    win = _winnability(sig.caller_total, sig.target_total)
    money = _money(sig)
    avail = _availability(sig)
    fresh = _fresh_cash(sig)
    poker = _poker(sig)
    breakdown = {
        "winnability": round(win, 1),
        "money": round(money, 1),
        "availability": round(avail, 1),
        "fresh_cash": round(fresh, 1),
        "poker": round(poker, 1),
    }
    raw = win + money + avail + fresh + poker  # 0..100

    if sig.mug_cooldown_remaining_h > 0.0:
        breakdown["cooldown_remaining_h"] = round(sig.mug_cooldown_remaining_h, 1)
        # score derives from raw (the unrounded sum), not from the individually-rounded breakdown values.
        return MugScore(score=int(raw * 0.25), tier="cooldown", hittable_now=False, breakdown=breakdown)

    score = int(min(100, max(0, raw)))
    hittable = not (sig.in_hospital or sig.is_abroad)
    if score >= 70:
        tier = "prime"
    elif score >= 50:
        tier = "good"
    elif score >= 30:
        tier = "meh"
    else:
        tier = "skip"
    return MugScore(score=score, tier=tier, hittable_now=hittable, breakdown=breakdown)
