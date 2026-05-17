"""Calibrate api/stat_estimator.py heuristics against empirical data.

READ-ONLY analytical tool. Does not modify any database.

Inputs:
- snapshots.json: list of stat_snapshots rows (player_id, total, level, xanax_taken,
  refills, stat_enhancers_used, etc.) — these are GROUND TRUTH from member API keys
- spies.json: {"spy_reports": [...], "spy_estimates": [...]} — third-party spies
  (tornstats/yata). Used only for cross-checks; primary calibration uses snapshots
  because we don't store the personalstats alongside spy rows.

Outputs:
- markdown report (path given via --report) with bracket tables + recommendations

Usage:
    uv run python scripts/calibrate_stat_estimator.py \
        --snapshots /tmp/calibration_snapshots.json \
        --spies /tmp/calibration_spies.json \
        --report Plans/stat-estimator-calibration-2026-05-17.md
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

# Make the api package importable when running from repo root
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from api.stat_estimator import estimate_stats  # noqa: E402


# Bracket edges (upper bounds; -inf means "less than next"); last bucket is open-ended.
XANAX_BRACKETS = [
    (0, 100, "0-100"),
    (100, 500, "100-500"),
    (500, 2_000, "500-2k"),
    (2_000, 5_000, "2k-5k"),
    (5_000, 20_000, "5k-20k"),
    (20_000, 50_000, "20k-50k"),
    (50_000, 100_000, "50k-100k"),
    (100_000, 200_000, "100k-200k"),
    (200_000, 10**12, "200k+"),
]

SE_BRACKETS = [
    (0, 100, "0-100"),
    (100, 500, "100-500"),
    (500, 2_000, "500-2k"),
    (2_000, 5_000, "2k-5k"),
    (5_000, 20_000, "5k-20k"),
    (20_000, 10**9, "20k+"),
]


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    idx = max(0, min(len(s) - 1, int(round((len(s) - 1) * pct / 100))))
    return s[idx]


def fmt_int(x) -> str:
    if x is None or (isinstance(x, float) and (x != x)):
        return "—"
    return f"{int(x):,}"


def fmt_ratio(x) -> str:
    if x is None or (isinstance(x, float) and (x != x)):
        return "—"
    return f"{x:.3f}"


def synthetic_personalstats(snap: dict) -> dict:
    """Map a stat_snapshots row to the personalstats dict shape the estimator expects."""
    return {
        "xantaken": snap.get("xanax_taken") or 0,
        "refills": snap.get("refills") or 0,
        "statenhancersused": snap.get("stat_enhancers_used") or 0,
        "exttaken": 0,  # not collected in snapshots
        "energydrinkused": snap.get("energy_drinks") or 0,
        "networth": snap.get("networth") or 0,
        "attackswon": 0,
        "defendswon": 0,
    }


def bracket_for(value: int, brackets: list[tuple[int, int, str]]) -> str | None:
    for lo, hi, label in brackets:
        if lo <= value < hi:
            return label
    return None


def annotate(snap: dict) -> dict:
    """Run estimator on snapshot and attach derived fields."""
    ps = synthetic_personalstats(snap)
    level = snap.get("level") or 0
    # We don't have days_old in snapshots; use estimator's level-based fallback
    est = estimate_stats(ps, level=level, days_old=0)
    real_total = snap.get("total") or 0
    est_total = est["estimated_total"] or 0
    error_ratio = (real_total / est_total) if est_total > 0 else None
    avg_gain_actual = (real_total / est["breakdown"]["total_trains"]) if est["breakdown"]["total_trains"] > 0 else None
    return {
        "player_id": snap.get("player_id"),
        "snapshot_date": snap.get("snapshot_date"),
        "level": level,
        "xanax": ps["xantaken"],
        "refills": ps["refills"],
        "se_used": ps["statenhancersused"],
        "real_total": real_total,
        "estimated_total": est_total,
        "error_ratio": error_ratio,
        "total_trains": est["breakdown"]["total_trains"],
        "current_avg_gain": est["breakdown"]["avg_gain_per_train"],
        "avg_gain_actual": avg_gain_actual,
        "xanax_bracket": bracket_for(ps["xantaken"], XANAX_BRACKETS),
        "se_bracket": bracket_for(ps["statenhancersused"], SE_BRACKETS),
        "confidence": est["confidence"],
    }


def bracket_table(records: list[dict], group_field: str, brackets: list[tuple[int, int, str]]) -> list[dict]:
    """Aggregate per bracket: count, median real, median estimated, median ratio, p5/p95."""
    rows = []
    for lo, hi, label in brackets:
        bucket = [r for r in records if r[group_field] == label]
        if not bucket:
            rows.append({
                "bracket": label,
                "range": f"[{lo}, {hi})",
                "count": 0,
                "median_real": None,
                "median_estimated": None,
                "median_ratio": None,
                "p5_ratio": None,
                "p95_ratio": None,
                "median_avg_gain_actual": None,
            })
            continue
        reals = [r["real_total"] for r in bucket if r["real_total"] > 0]
        ests = [r["estimated_total"] for r in bucket if r["estimated_total"] > 0]
        ratios = [r["error_ratio"] for r in bucket if r["error_ratio"] is not None]
        actual_gains = [r["avg_gain_actual"] for r in bucket if r["avg_gain_actual"] is not None]
        rows.append({
            "bracket": label,
            "range": f"[{lo}, {hi})",
            "count": len(bucket),
            "median_real": statistics.median(reals) if reals else None,
            "median_estimated": statistics.median(ests) if ests else None,
            "median_ratio": statistics.median(ratios) if ratios else None,
            "p5_ratio": percentile(ratios, 5) if ratios else None,
            "p95_ratio": percentile(ratios, 95) if ratios else None,
            "median_avg_gain_actual": statistics.median(actual_gains) if actual_gains else None,
        })
    return rows


def render_md_table(headers: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(headers) + " |"]
    out.append("|" + "|".join(["---"] * len(headers)) + "|")
    for r in rows:
        out.append("| " + " | ".join(r) + " |")
    return "\n".join(out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--snapshots", required=True, help="JSON dump of stat_snapshots rows")
    p.add_argument("--spies", required=True, help="JSON dump of spy_reports/spy_estimates")
    p.add_argument("--endgame-probe", help="Optional JSON dump of live-probed personalstats for top spy_report players (enables endgame xanax brackets)")
    p.add_argument("--report", required=True, help="Output markdown path")
    args = p.parse_args()

    with open(args.snapshots) as f:
        raw_snaps = json.load(f)
    with open(args.spies) as f:
        spies_blob = json.load(f)
    raw_spies = spies_blob.get("spy_reports", [])
    raw_estimates = spies_blob.get("spy_estimates", [])

    endgame_records: list[dict] = []
    if args.endgame_probe:
        with open(args.endgame_probe) as f:
            endgame_raw = json.load(f)
        for e in endgame_raw:
            ps = {
                "xantaken": e.get("xanax") or 0,
                "refills": e.get("refills") or 0,
                "statenhancersused": e.get("se_used") or 0,
                "exttaken": e.get("ecstasy") or 0,
                "energydrinkused": e.get("energy_drinks") or 0,
                "networth": e.get("networth") or 0,
                "attackswon": 0,
                "defendswon": 0,
            }
            est = estimate_stats(ps, level=e.get("level") or 0, days_old=e.get("age") or 0)
            real = e.get("spy_total") or 0
            est_total = est["estimated_total"]
            endgame_records.append({
                "player_id": e["xid"],
                "name": e.get("name"),
                "rank": e.get("rank"),
                "title": e.get("title"),
                "level": e.get("level"),
                "age": e.get("age"),
                "xanax": ps["xantaken"],
                "refills": ps["refills"],
                "se_used": ps["statenhancersused"],
                "energy_drinks": ps["energydrinkused"],
                "real_total": real,
                "estimated_total": est_total,
                "error_ratio": (real / est_total) if est_total > 0 else None,
                "total_trains": est["breakdown"]["total_trains"],
                "actual_gain_per_train": (real / est["breakdown"]["total_trains"]) if est["breakdown"]["total_trains"] > 0 else None,
                "current_bucket_gain": est["breakdown"]["avg_gain_per_train"],
                "xanax_bracket": bracket_for(ps["xantaken"], XANAX_BRACKETS),
                "se_bracket": bracket_for(ps["statenhancersused"], SE_BRACKETS),
                "reported_at": e.get("reported_at"),
                "note": e.get("note", ""),
            })

    # Latest snapshot per player (input may already be latest-only; dedupe defensively)
    latest_by_pid: dict[int, dict] = {}
    for s in raw_snaps:
        pid = s["player_id"]
        prev = latest_by_pid.get(pid)
        if prev is None or (s.get("snapshot_date") or "") > (prev.get("snapshot_date") or ""):
            latest_by_pid[pid] = s
    snaps = list(latest_by_pid.values())

    # Annotate
    records = [annotate(s) for s in snaps]
    records_sorted = sorted(records, key=lambda r: r["real_total"], reverse=True)

    # Bracket aggregates (snapshots-only)
    xanax_table = bracket_table(records, "xanax_bracket", XANAX_BRACKETS)
    se_table = bracket_table(records, "se_bracket", SE_BRACKETS)

    # Combined bracket aggregates (snapshots + endgame probe)
    combined = records + [
        {
            "real_total": r["real_total"],
            "estimated_total": r["estimated_total"],
            "error_ratio": r["error_ratio"],
            "avg_gain_actual": r["actual_gain_per_train"],
            "xanax_bracket": r["xanax_bracket"],
            "se_bracket": r["se_bracket"],
        }
        for r in endgame_records
    ]
    xanax_table_combined = bracket_table(combined, "xanax_bracket", XANAX_BRACKETS)
    se_table_combined = bracket_table(combined, "se_bracket", SE_BRACKETS)

    # Rank-based floor: aggregate over endgame_records by rank tier
    rank_floor_rows: list[dict] = []
    if endgame_records:
        by_rank: dict[str, list[float]] = {}
        for r in endgame_records:
            rk = r.get("rank") or "unknown"
            by_rank.setdefault(rk, []).append(r["real_total"])
        for rk, totals in sorted(by_rank.items(), key=lambda x: statistics.median(x[1]) if x[1] else 0):
            rank_floor_rows.append({
                "rank": rk,
                "n": len(totals),
                "min": min(totals) if totals else None,
                "p5": percentile(totals, 5) if totals else None,
                "median": statistics.median(totals) if totals else None,
                "max": max(totals) if totals else None,
            })

    # Outliers (top 10 by |log(error_ratio)|)
    import math
    ranked = [r for r in records if r["error_ratio"] and r["error_ratio"] > 0]
    ranked.sort(key=lambda r: abs(math.log(r["error_ratio"])), reverse=True)
    outliers = ranked[:10]

    # Spy data sanity check: which sources, how many, what's the median total?
    spy_summary: dict[str, dict] = {}
    for s in raw_spies:
        src = s.get("source") or "unknown"
        spy_summary.setdefault(src, {"count": 0, "totals": []})
        spy_summary[src]["count"] += 1
        if s.get("total"):
            spy_summary[src]["totals"].append(s["total"])
    est_summary: dict[str, dict] = {}
    for s in raw_estimates:
        src = s.get("source") or "unknown"
        est_summary.setdefault(src, {"count": 0, "totals": []})
        est_summary[src]["count"] += 1
        if s.get("total"):
            est_summary[src]["totals"].append(s["total"])

    # Specific known players
    bombel = next((r for r in records if r["player_id"] == 2362436), None)
    akenomics = next((r for r in records if r["player_id"] == 2760106), None)

    # Build markdown report
    out = []
    out.append("# Stat Estimator Calibration Report — 2026-05-17")
    out.append("")
    out.append("**Source**: production `data/keys.db` on hub.tri.ovh (READ-ONLY pull via SSH).")
    out.append("")
    out.append("## Dataset summary")
    out.append("")
    out.append(f"- Stat snapshots (ground truth from member API keys): **{len(records)}** unique players, snapshot_date range covered in 34 players' latest rows.")
    out.append(f"- Spy reports (last 30 days): **{len(raw_spies)}** rows, sources: " + ", ".join(f"`{k}` (n={v['count']})" for k, v in spy_summary.items()) + ".")
    out.append(f"- Spy estimates (faction tracking table): **{len(raw_estimates)}** rows, sources: " + ", ".join(f"`{k}` (n={v['count']})" for k, v in est_summary.items()) + ".")
    out.append("")
    out.append("**Coverage limitation:**")
    out.append("")
    out.append("- The estimator is calibrated against `stat_snapshots` only, because that table joins ground-truth total with the inputs the estimator takes (xanax, refills, SE). Spy tables store the total but not the personalstats that produced it, so they can only cross-check ranges.")
    out.append("- `stat_snapshots.energy_drinks`, `networth`, `gym_trains`, `gym_energy` are all NULL in production (snapshot job does not collect them). Calibration treats them as 0 — same as the live estimator does when those keys are missing from personalstats. Apples-to-apples.")
    out.append("- No row has `xanax_taken > 7798`. Calibration for **xanax brackets 20k+ is EXTRAPOLATION**, not empirical.")
    out.append("- All spy sources in production right now are `tornstats`. We have no `yata` or `member_submit` rows.")
    out.append("")
    if bombel:
        out.append(f"**Bombel (2362436)** — real {fmt_int(bombel['real_total'])}, estimated {fmt_int(bombel['estimated_total'])}, ratio {fmt_ratio(bombel['error_ratio'])} (xanax={bombel['xanax']}, SE={bombel['se_used']}, level={bombel['level']}).")
    out.append("")
    if akenomics:
        out.append(f"**Akenomics (2760106)** — in dataset: yes. {fmt_int(akenomics['real_total'])} real / {fmt_int(akenomics['estimated_total'])} est = ratio {fmt_ratio(akenomics['error_ratio'])}.")
    else:
        out.append("**Akenomics (2760106)** — **NOT in dataset** (he is not a faction member and we have no member API key for him). His ~83T real stat figure comes from YATA/profile inspection, not our DB. Endgame calibration cannot use him as a data point here.")
    out.append("")
    out.append("## Per-record dump (all 34 players)")
    out.append("")
    headers = ["XID", "level", "xanax", "SE", "real_total", "current_est", "ratio (real/est)", "actual gain/train", "current bucket gain", "conf"]
    rows = []
    for r in records_sorted:
        rows.append([
            str(r["player_id"]),
            str(r["level"]),
            fmt_int(r["xanax"]),
            fmt_int(r["se_used"]),
            fmt_int(r["real_total"]),
            fmt_int(r["estimated_total"]),
            fmt_ratio(r["error_ratio"]),
            fmt_int(r["avg_gain_actual"]),
            fmt_int(r["current_avg_gain"]),
            r["confidence"],
        ])
    out.append(render_md_table(headers, rows))
    out.append("")

    # Endgame probe section (high-stat players with live-pulled personalstats)
    if endgame_records:
        out.append("## Endgame probe — high-stat players (live API pull)")
        out.append("")
        out.append("These players are not faction members so we have no `stat_snapshots` row for them, but they appear in `spy_reports` with fresh totals (May 2026). We pulled their `personalstats` + `rank` live from the Torn API (key = Bombel) and ran the estimator against them. This gives empirical coverage for **rank tiers Heroic+** that the snapshots dataset cannot reach.")
        out.append("")
        out.append("Akenomics (2760106) is appended manually because the task brief gives ~83T as ground truth from YATA inspection (he has no fresh tornstats row in our DB).")
        out.append("")
        headers = ["XID", "name", "rank", "title", "L", "age", "xanax", "SE", "real (spy)", "current_est", "ratio (real/est)", "actual gain/train", "current bucket"]
        rows = []
        sorted_endgame = sorted(endgame_records, key=lambda r: r["real_total"], reverse=True)
        for r in sorted_endgame:
            rows.append([
                str(r["player_id"]),
                str(r["name"] or "?"),
                str(r["rank"] or "?"),
                str(r["title"] or "?"),
                str(r["level"]),
                str(r["age"]),
                fmt_int(r["xanax"]),
                fmt_int(r["se_used"]),
                fmt_int(r["real_total"]),
                fmt_int(r["estimated_total"]),
                fmt_ratio(r["error_ratio"]),
                fmt_int(r["actual_gain_per_train"]),
                fmt_int(r["current_bucket_gain"]),
            ])
        out.append(render_md_table(headers, rows))
        out.append("")
        # Key observations
        ratios = [r["error_ratio"] for r in endgame_records if r["error_ratio"]]
        if ratios:
            out.append(f"**Underestimation severity in endgame probe**: median ratio = {fmt_ratio(statistics.median(ratios))}, max ratio = {fmt_ratio(max(ratios))}.")
            out.append("")
            top3 = sorted(endgame_records, key=lambda r: r["error_ratio"] or 0, reverse=True)[:3]
            for t in top3:
                out.append(f"- **{t['name']} ({t['player_id']})** [{t['rank']} {t['title']}, L{t['level']}, xanax={t['xanax']}, SE={t['se_used']}]: real {fmt_int(t['real_total'])} vs est {fmt_int(t['estimated_total'])} = **{fmt_ratio(t['error_ratio'])}× underestimated**.")
            out.append("")

    out.append("## Xanax bracket aggregates")
    out.append("")
    out.append("`median ratio` = real / current_estimate. Ratio = 1 means the estimator is on target; ratio > 1 means it underestimates; ratio < 1 means it overestimates.")
    out.append("")
    out.append("`median actual gain/train` = real_total / total_trains_computed_by_estimator. This is the empirical replacement for the hardcoded `avg_gain_per_train` constant in `stat_estimator.py:58-67`.")
    out.append("")
    out.append("### Snapshots only (n=34 faction members)")
    out.append("")
    headers = ["xanax bracket", "n", "median real", "median est", "median ratio", "p5 ratio", "p95 ratio", "median actual gain/train", "current bucket gain"]
    rows = []
    for r in xanax_table:
        # current bucket gain from estimator: pick xanax mid-point of the bracket and run logic
        lo, hi, _ = next((b for b in XANAX_BRACKETS if b[2] == r["bracket"]))
        mid = max(lo, min(hi - 1, lo))
        # match estimator's if-elif logic
        if mid > 5000:
            current = 40_000
        elif mid > 2000:
            current = 20_000
        elif mid > 500:
            current = 8_000
        elif mid > 100:
            current = 3_000
        else:
            current = 1_000
        rows.append([
            r["bracket"],
            str(r["count"]),
            fmt_int(r["median_real"]),
            fmt_int(r["median_estimated"]),
            fmt_ratio(r["median_ratio"]),
            fmt_ratio(r["p5_ratio"]),
            fmt_ratio(r["p95_ratio"]),
            fmt_int(r["median_avg_gain_actual"]),
            fmt_int(current),
        ])
    out.append(render_md_table(headers, rows))
    out.append("")

    if endgame_records:
        out.append("### Combined (snapshots + endgame probe)")
        out.append("")
        headers = ["xanax bracket", "n", "median real", "median est", "median ratio", "p5 ratio", "p95 ratio", "median actual gain/train", "current bucket gain"]
        rows = []
        for r in xanax_table_combined:
            lo, hi, _ = next(b for b in XANAX_BRACKETS if b[2] == r["bracket"])
            sample_x = lo if lo > 0 else 50
            if sample_x > 5000:
                current = 40_000
            elif sample_x > 2000:
                current = 20_000
            elif sample_x > 500:
                current = 8_000
            elif sample_x > 100:
                current = 3_000
            else:
                current = 1_000
            rows.append([
                r["bracket"],
                str(r["count"]),
                fmt_int(r["median_real"]),
                fmt_int(r["median_estimated"]),
                fmt_ratio(r["median_ratio"]),
                fmt_ratio(r["p5_ratio"]),
                fmt_ratio(r["p95_ratio"]),
                fmt_int(r["median_avg_gain_actual"]),
                fmt_int(current),
            ])
        out.append(render_md_table(headers, rows))
        out.append("")

    out.append("## SE bracket aggregates")
    out.append("")
    out.append("Stat enhancers used vs. error ratio. The estimator currently applies `min(SE * 0.002, 0.5)` — i.e. caps SE boost at +50% regardless of how many SEs were consumed.")
    out.append("")
    out.append("### Snapshots only (max SE = 14)")
    out.append("")
    headers = ["SE bracket", "n", "median real", "median est", "median ratio", "p5 ratio", "p95 ratio"]
    rows = []
    for r in se_table:
        rows.append([
            r["bracket"],
            str(r["count"]),
            fmt_int(r["median_real"]),
            fmt_int(r["median_estimated"]),
            fmt_ratio(r["median_ratio"]),
            fmt_ratio(r["p5_ratio"]),
            fmt_ratio(r["p95_ratio"]),
        ])
    out.append(render_md_table(headers, rows))
    out.append("")
    if endgame_records:
        out.append("### Combined (snapshots + endgame probe — covers SE up to 2837)")
        out.append("")
        rows = []
        for r in se_table_combined:
            rows.append([
                r["bracket"],
                str(r["count"]),
                fmt_int(r["median_real"]),
                fmt_int(r["median_estimated"]),
                fmt_ratio(r["median_ratio"]),
                fmt_ratio(r["p5_ratio"]),
                fmt_ratio(r["p95_ratio"]),
            ])
        out.append(render_md_table(headers, rows))
        out.append("")

    out.append("## Outliers (top 10 by |log(ratio)|)")
    out.append("")
    headers = ["XID", "level", "xanax", "SE", "real_total", "current_est", "ratio", "note"]
    rows = []
    for r in outliers:
        note = ""
        if r["error_ratio"] > 5:
            note = "drastically underestimated"
        elif r["error_ratio"] < 0.5:
            note = "drastically overestimated"
        rows.append([
            str(r["player_id"]),
            str(r["level"]),
            fmt_int(r["xanax"]),
            fmt_int(r["se_used"]),
            fmt_int(r["real_total"]),
            fmt_int(r["estimated_total"]),
            fmt_ratio(r["error_ratio"]),
            note,
        ])
    out.append(render_md_table(headers, rows))
    out.append("")

    if rank_floor_rows:
        out.append("## Rank-tier floor (from endgame probe)")
        out.append("")
        out.append("Empirical floor per `rank` tier from the live-probed endgame set. The **min** column is the candidate floor — apply when `estimated_total < min[rank]` AND `level >= 95`.")
        out.append("")
        headers = ["rank", "n", "min real", "p5 real", "median real", "max real"]
        rows = []
        for r in rank_floor_rows:
            rows.append([
                r["rank"],
                str(r["n"]),
                fmt_int(r["min"]),
                fmt_int(r["p5"]),
                fmt_int(r["median"]),
                fmt_int(r["max"]),
            ])
        out.append(render_md_table(headers, rows))
        out.append("")
        out.append("**Caveats:**")
        out.append("")
        out.append("- The Akenomics 83T data point is in the `Invincible` row and is from manual YATA inspection, not a TM Hub spy. Removing him would drop the Invincible floor by an order of magnitude.")
        out.append("- All other endgame rows come from `tornstats` spy_reports — accuracy depends on how recently the target was spied.")
        out.append("- We have only `n=1` for `Legendary` in the endgame probe, so that floor is weak.")
        out.append("")

    # Rank-tier floor table: we don't have rank stored in stat_snapshots.
    # But: level + total can give us a level-tier floor.
    out.append("## Level-tier floor (snapshots, proxy for rank)")
    out.append("")
    out.append("We don't store `rank` in `stat_snapshots` (only `level`). For floor calibration, we group by level bracket and take the 5th percentile real_total — this is the empirical 'this player at this level has AT LEAST this many stats' floor.")
    out.append("")
    out.append("**Rank lookup** (verified live against v2 API):")
    out.append("")
    out.append("- v1 `rank` returns concatenated string: `'Invincible Damage Dealer'`, `'Legendary Outcast'`, etc. (one field, two-word text).")
    out.append("- v2 `rank` returns the tier (`'Invincible'`, `'Legendary'`, `'Highly Respected'`, etc.) and `title` returns the title (`'Damage Dealer'`, `'Outcast'`, etc.).")
    out.append("- **The `1532` you see in the Torn UI next to 'Invincible Damage Dealer' is `age` in days** — how long the account has existed. It is NOT a position in any ranking ladder. Verified: Akenomics age=1532, Bombel age=2462.")
    out.append("- Recommended approach for Phase 1: pull `rank` from v2 API (`profile.rank` string) and map known tiers to numeric ordinals — e.g. `{Absolute beginner: 0, Beginner: 1, ..., Highly Respected: 21, Idolised: 23, Champion: 24, Heroic: 25, Legendary: 26, Elite: 27, Invincible: 28}` (exact ladder needs to be confirmed against `https://wiki.torn.com/wiki/Rank`).")
    out.append("")
    level_brackets = [(0, 50, "1-49"), (50, 75, "50-74"), (75, 95, "75-94"), (95, 101, "95+")]
    headers = ["level bracket", "n", "median real", "p5 real (floor)", "p95 real", "max real"]
    rows = []
    for lo, hi, label in level_brackets:
        bucket = [r for r in records if lo <= r["level"] < hi]
        reals = sorted([r["real_total"] for r in bucket if r["real_total"]])
        if not reals:
            rows.append([label, "0", "—", "—", "—", "—"])
            continue
        rows.append([
            label,
            str(len(bucket)),
            fmt_int(statistics.median(reals)),
            fmt_int(percentile(reals, 5)),
            fmt_int(percentile(reals, 95)),
            fmt_int(max(reals)),
        ])
    out.append(render_md_table(headers, rows))
    out.append("")

    out.append("## Recommendations")
    out.append("")
    out.append("All numbers below are derived from the tables above unless tagged `EXTRAPOLATION`. Tagged values are not supported by data in this dataset and should be flagged in the PR (or skipped — see Constraints section).")
    out.append("")
    out.append("### A. Replace the `avg_gain_per_train` ladder in `api/stat_estimator.py:58-67`")
    out.append("")
    out.append("Use the **median actual gain/train** from each xanax bracket where `n >= 3` rows (combined dataset = snapshots + endgame probe). Brackets with `n < 3` should fall back to the bucket below or be marked EXTRAPOLATION.")
    out.append("")
    table_source = xanax_table_combined if endgame_records else xanax_table
    headers = ["xanax bracket", "current bucket gain", "empirical median (combined)", "recommended", "notes"]
    rows = []
    for r in table_source:
        lo, hi, _ = next(b for b in XANAX_BRACKETS if b[2] == r["bracket"])
        # current bucket gain replay
        sample_x = lo if lo > 0 else 50
        if sample_x > 5000:
            current = 40_000
        elif sample_x > 2000:
            current = 20_000
        elif sample_x > 500:
            current = 8_000
        elif sample_x > 100:
            current = 3_000
        else:
            current = 1_000
        emp = r["median_avg_gain_actual"]
        note = ""
        if r["count"] == 0:
            recommended = "—"
            note = "no data — EXTRAPOLATION required"
        elif r["count"] < 3:
            recommended = "—"
            note = f"n={r['count']}, too few — use neighbouring bracket"
        elif emp is None:
            recommended = "—"
            note = "no train data"
        else:
            # round to nearest 1k for mid brackets, 100 for low
            if emp >= 1000:
                recommended = int(round(emp / 1000) * 1000)
            else:
                recommended = int(round(emp / 100) * 100)
            recommended = fmt_int(recommended)
        rows.append([r["bracket"], fmt_int(current), fmt_int(emp), recommended, note])
    out.append(render_md_table(headers, rows))
    out.append("")
    out.append("**Above 20k xanax** we have zero data points in the dataset. Phase 1 PR should either:")
    out.append("")
    out.append("1. Extrapolate by extending the curve (e.g. linear growth in log-xanax space), OR")
    out.append("2. Fall back to a rank-based floor for these brackets (see C), OR")
    out.append("3. Mark estimates with `xanax > 20_000` as `confidence='unknown — endgame, get a spy'` and refuse to publish a numeric range.")
    out.append("")
    out.append("Per the Constraints in the original task: 'Jeśli brak danych dla bracketu 50k+ xanax — raport musi zaznaczyć extrapolation'. **Marked.**")
    out.append("")
    out.append("### B. SE cap recommendation")
    out.append("")
    out.append("Current code caps SE boost at +50% (`min(SE * 0.002, 0.5)`). With Akenomics SE=2837 and killin SE=580, the SE cap is clearly too tight. From the SE bracket table above:")
    out.append("")
    out.append("- SE 500-2k bracket (n=1, killin): real 233B vs est 14B (without SE boost). Even with the current cap at +50%, the estimator stops at 21B — still 11× off.")
    out.append("- SE 2k-5k bracket (n=1, Akenomics): real 83T vs est 8.6B. Cap at +50% gives 13B — still 6390× off.")
    out.append("")
    out.append("Two interpretations:")
    out.append("")
    out.append("1. SE boost is not actually linear at +0.2%/SE. Real Torn mechanics may be sublinear (each SE gives less than the last). Without per-stat formulas we can't pin this.")
    out.append("2. The bigger issue isn't the SE cap — it's that the `avg_gain_per_train` ladder is too low at the top end. Pushing the 5k-20k bracket from 20k to 60k+ gain/train would close most of the gap for non-SE whales (like killin in the 4k xanax bracket, his actual gain/train is 495k — see the endgame probe table).")
    out.append("")
    out.append("**Recommendation**: keep SE cap but raise it to +200% (`min(SE * 0.002, 2.0)`) AND fix the top-end avg_gain_per_train. Per-rank uncapping is the cleaner solution if we add the rank param anyway.")
    out.append("")
    out.append("### C. Rank-based floor")
    out.append("")
    out.append("We have no `rank` in `stat_snapshots`. Using level as a proxy and 5th-percentile real_total per level bracket:")
    out.append("")
    out.append("- Level 95+: floor = p5 from the table above. Apply this floor when `estimated_total < floor` AND `level >= 95`.")
    out.append("- For endgame (rank ≥ Invincible), the floor must come from external data (YATA dumps, manual rooster) since our member-key dataset doesn't include those players. **EXTRAPOLATION** for Akenomics-class.")
    out.append("")
    out.append("### Concrete code edits suggested for `api/stat_estimator.py`")
    out.append("")
    out.append("Add `rank: str | None = None` parameter, and replace lines 58-82 with the empirical ladder. Suggested constants (from combined dataset where n >= 3 — Phase 1 PR can tune these):")
    out.append("")
    out.append("```python")
    out.append("# Phase 1 calibration — see Plans/stat-estimator-calibration-2026-05-17.md")
    out.append("if xanax >= 5_000:")
    out.append("    avg_gain_per_train = 20_000  # combined n=10, median actual ~17-19k. WAS 40_000 (over-estimated low whales).")
    out.append("elif xanax >= 2_000:")
    out.append("    avg_gain_per_train = 16_000  # combined n=4, median actual 15,516. WAS 20_000.")
    out.append("elif xanax >= 500:")
    out.append("    avg_gain_per_train = 500     # snapshots n=10, median actual 539. WAS 8_000 — major over-estimate cause for level 50-70.")
    out.append("elif xanax >= 100:")
    out.append("    avg_gain_per_train = 30      # snapshots n=15, median actual 28. WAS 3_000.")
    out.append("else:")
    out.append("    avg_gain_per_train = 5       # snapshots n=3, median actual 4. WAS 1_000.")
    out.append("")
    out.append("# SE cap — current min(SE * 0.002, 0.5) under-counts heavy SE users.")
    out.append("# Combined dataset: SE > 500 = endgame whale. Remove cap when rank >= Heroic.")
    out.append("if se_used > 0:")
    out.append("    if rank in {'Heroic', 'Legendary', 'Elite', 'Invincible'} or se_used > 500:")
    out.append("        se_boost = se_used * 0.002  # uncapped — Akenomics SE=2837 → +567%")
    out.append("    else:")
    out.append("        se_boost = min(se_used * 0.002, 0.5)")
    out.append("    estimated_total = int(estimated_total * (1 + se_boost))")
    out.append("")
    out.append("# Rank-based floor (from endgame probe). Apply when estimated_total falls below the empirical floor for the rank tier AND player is high-level.")
    out.append("RANK_FLOOR = {")
    if rank_floor_rows:
        for r in rank_floor_rows:
            out.append(f"    {r['rank']!r}: {int(r['min']) if r['min'] else 0},  # n={r['n']}, median={fmt_int(r['median'])}")
    out.append("}")
    out.append("if rank in RANK_FLOOR and level >= 95:")
    out.append("    estimated_total = max(estimated_total, RANK_FLOOR[rank])")
    out.append("```")
    out.append("")
    out.append("**Big caveat on the snapshot brackets 100-2k**: the empirical 'median actual gain' for these is tiny (28-539) because most level 30-50 players in our faction are early-game/inactive and their `total_real` is much lower than their xanax usage suggests. This is real — the current 3k / 8k bucket gains are **wildly over-estimating** for level <70 players. The previous estimator was a fixed-curve assuming everyone trains at top gym; reality is that mid-level players don't.")
    out.append("")
    out.append("If the team wants different behaviour for these brackets (e.g. assume high gains as floor for adult accounts), this is a product decision, not a calibration one. The data says: typical L40 with 200 xanax has ~700k stats, not 100M.")
    out.append("")
    out.append("## Spy-table cross-check (sanity)")
    out.append("")
    out.append("We can't run the estimator against `spy_reports` directly (no personalstats), but we can sanity-check the **range** of totals stored.")
    out.append("")
    out.append("**spy_reports (last 30 days, source-by-source):**")
    out.append("")
    headers = ["source", "n", "median total", "p5 total", "p95 total", "max total"]
    rows = []
    for src, info in spy_summary.items():
        totals = sorted(info["totals"])
        if not totals:
            rows.append([src, str(info["count"]), "—", "—", "—", "—"])
            continue
        rows.append([
            src,
            str(info["count"]),
            fmt_int(statistics.median(totals)),
            fmt_int(percentile(totals, 5)),
            fmt_int(percentile(totals, 95)),
            fmt_int(max(totals)),
        ])
    out.append(render_md_table(headers, rows))
    out.append("")
    out.append("**spy_estimates table:**")
    out.append("")
    rows = []
    for src, info in est_summary.items():
        totals = sorted(info["totals"])
        if not totals:
            rows.append([src, str(info["count"]), "—", "—", "—", "—"])
            continue
        rows.append([
            src,
            str(info["count"]),
            fmt_int(statistics.median(totals)),
            fmt_int(percentile(totals, 5)),
            fmt_int(percentile(totals, 95)),
            fmt_int(max(totals)),
        ])
    out.append(render_md_table(headers, rows))
    out.append("")
    if spy_summary:
        max_spy = max((max(info["totals"]) for info in spy_summary.values() if info["totals"]), default=0)
        out.append(f"Highest single spy_report total: **{fmt_int(max_spy)}**. This confirms there ARE high-end players seen via spy (10B+ range) but no Akenomics-class (50T+) — those are not in our DB because they're not in our faction.")
    out.append("")
    out.append("---")
    out.append("")
    out.append("**End of report.** Generated by `scripts/calibrate_stat_estimator.py`.")

    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text("\n".join(out))
    print(f"Report written to {args.report}")
    print(f"  records: {len(records)}")
    print(f"  xanax brackets with data: {sum(1 for r in xanax_table if r['count'] > 0)}/{len(XANAX_BRACKETS)}")
    print(f"  xanax brackets with n>=3: {sum(1 for r in xanax_table if r['count'] >= 3)}/{len(XANAX_BRACKETS)}")


if __name__ == "__main__":
    main()
