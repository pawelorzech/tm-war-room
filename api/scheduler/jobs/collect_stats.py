from __future__ import annotations
import logging
from datetime import date
from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository

logger = logging.getLogger("tm-hub.jobs.collect_stats")

async def collect_stat_snapshots(key_repo: KeyRepository, stats_repo: StatSnapshotRepository, torn_client) -> None:
    all_keys = key_repo.get_all_keys()
    today = date.today().isoformat()
    collected = 0
    for entry in all_keys:
        try:
            data = await torn_client.fetch_training_data(entry["api_key"])
            if data is None:
                logger.warning("Failed to fetch stats for player %d", entry["player_id"])
                continue
            bs = data["battlestats"]
            ps = data.get("personalstats", {})
            total = bs["strength"] + bs["defense"] + bs["speed"] + bs["dexterity"]
            stats_repo.insert_snapshot(
                player_id=entry["player_id"], snapshot_date=today,
                strength=bs["strength"], defense=bs["defense"],
                speed=bs["speed"], dexterity=bs["dexterity"], total=total,
                level=data.get("level"),
                xanax_taken=ps.get("xanax_taken"),
                refills=ps.get("refills"),
                energy_drinks=ps.get("energy_drinks"),
                networth=ps.get("networth"),
            )
            collected += 1
        except Exception as e:
            logger.error("Error collecting stats for player %d: %s", entry["player_id"], e)
    logger.info("Collected stat snapshots: %d/%d members", collected, len(all_keys))


async def run_collect_stats() -> None:
    """Top-level entry point for APScheduler (must be importable, not nested)."""
    from api.scheduler.engine import get_state
    state = get_state()
    await collect_stat_snapshots(state["key_repo"], state["stats_repo"], state["torn_client"])
