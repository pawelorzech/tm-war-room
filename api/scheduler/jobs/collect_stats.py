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

            # Fetch extended personalstats for leaderboard tracking
            ext_ps = await _fetch_extended_personalstats(torn_client, entry["api_key"])

            stats_repo.insert_snapshot(
                player_id=entry["player_id"], snapshot_date=today,
                strength=bs["strength"], defense=bs["defense"],
                speed=bs["speed"], dexterity=bs["dexterity"], total=total,
                level=data.get("level"),
                xanax_taken=ps.get("xanax_taken") or ps.get("xantaken"),
                refills=ps.get("refills"),
                energy_drinks=ps.get("energy_drinks"),
                networth=ps.get("networth"),
                gym_trains=ext_ps.get("gymtrains"),
                stat_enhancers_used=ext_ps.get("statenhancersused") or ps.get("statenhancersused"),
                easter_eggs=ext_ps.get("eastereggs"),
            )
            collected += 1
        except Exception as e:
            logger.error("Error collecting stats for player %d: %s", entry["player_id"], e)
    logger.info("Collected stat snapshots: %d/%d members", collected, len(all_keys))


async def _fetch_extended_personalstats(torn_client, api_key: str) -> dict:
    """Fetch extended personalstats (gym trains, easter eggs, etc) from Torn API v1."""
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
            "gymtrains": ps.get("gymtrains", 0),
            "statenhancersused": ps.get("statenhancersused", 0),
            "eastereggs": ps.get("eastereggs"),  # None if not in API response
        }
    except Exception:
        return {}


async def run_collect_stats() -> None:
    """Top-level entry point for APScheduler (must be importable, not nested)."""
    from api.scheduler.engine import get_state
    state = get_state()
    await collect_stat_snapshots(state["key_repo"], state["stats_repo"], state["torn_client"])
