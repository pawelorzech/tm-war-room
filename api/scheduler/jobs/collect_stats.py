from __future__ import annotations
import asyncio
import logging
from datetime import date
from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository
from api.scheduler.jobs._log_helpers import report_job_error

logger = logging.getLogger("tm-hub.jobs.collect_stats")

BATCH_SIZE = 10

_OK = "ok"
_FETCH_NONE = "fetch_none"


async def _collect_one(entry: dict, today: str, stats_repo: StatSnapshotRepository, torn_client) -> str:
    """Fetch + persist one member's snapshot. Raises on error so the orchestrator
    can capture the stack trace via Sentry — handling here would lose it."""
    data = await torn_client.fetch_training_data(entry["api_key"])
    if data is None:
        logger.warning("Failed to fetch stats for player %d", entry["player_id"])
        return _FETCH_NONE
    bs = data["battlestats"]
    ps = data.get("personalstats", {})
    total = bs["strength"] + bs["defense"] + bs["speed"] + bs["dexterity"]

    ext_ps = await _fetch_extended_personalstats(torn_client, entry["api_key"])

    gym_energy = sum(ps.get(k, 0) or 0 for k in ("gymstrength", "gymdefense", "gymspeed", "gymdexterity"))

    stats_repo.insert_snapshot(
        player_id=entry["player_id"], snapshot_date=today,
        strength=bs["strength"], defense=bs["defense"],
        speed=bs["speed"], dexterity=bs["dexterity"], total=total,
        level=data.get("level"),
        xanax_taken=ps.get("xanax_taken") or ps.get("xantaken"),
        refills=ps.get("refills"),
        energy_drinks=ps.get("energy_drinks"),
        networth=ps.get("networth"),
        stat_enhancers_used=ext_ps.get("statenhancersused") or ps.get("statenhancersused"),
        easter_eggs=ext_ps.get("eastereggs"),
        gym_energy=gym_energy or None,
    )
    return _OK


async def collect_stat_snapshots(key_repo: KeyRepository, stats_repo: StatSnapshotRepository, torn_client) -> None:
    if torn_client is None:
        logger.error("collect_stat_snapshots: torn_client is None — cannot fetch (state init issue)")
        return
    all_keys = key_repo.get_all_keys()
    today = date.today().isoformat()
    if not all_keys:
        logger.warning("collect_stat_snapshots: no keys in member_keys — nothing to collect")
        return
    logger.info("collect_stat_snapshots: starting for %d members on %s", len(all_keys), today)
    success = 0
    fetch_none = 0
    exception_count = 0
    # Process in batches to respect Torn API rate limits
    for i in range(0, len(all_keys), BATCH_SIZE):
        batch = all_keys[i:i + BATCH_SIZE]
        results = await asyncio.gather(
            *[_collect_one(entry, today, stats_repo, torn_client) for entry in batch],
            return_exceptions=True,
        )
        for entry, result in zip(batch, results):
            if isinstance(result, Exception):
                exception_count += 1
                report_job_error(
                    logger,
                    f"collect_stat_snapshots: player {entry['player_id']} raised — %s",
                    result,
                    job="collect_stats",
                    extra_tags={"player_id": entry["player_id"]},
                )
            elif result == _OK:
                success += 1
            elif result == _FETCH_NONE:
                fetch_none += 1
    total = len(all_keys)
    logger.info(
        "collect_stat_snapshots: done — success=%d fetch_none=%d exceptions=%d total=%d",
        success, fetch_none, exception_count, total,
    )


async def _fetch_extended_personalstats(torn_client, api_key: str) -> dict:
    """Fetch extended personalstats (easter eggs, SE count, etc) from Torn API v1."""
    try:
        from api.torn_client import _json
        resp = await torn_client._http.get(
            "https://api.torn.com/user/",
            params={"selections": "personalstats", "key": api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        ps = raw.get("personalstats", {})
        return {
            "statenhancersused": ps.get("statenhancersused", 0),
            "eastereggs": ps.get("eastereggs"),  # seasonal — None when no event
        }
    except Exception:
        return {}


async def run_collect_stats() -> None:
    """Top-level entry point for APScheduler (must be importable, not nested)."""
    from api.scheduler.engine import get_state
    state = get_state()
    await collect_stat_snapshots(state["key_repo"], state["stats_repo"], state["torn_client"])
