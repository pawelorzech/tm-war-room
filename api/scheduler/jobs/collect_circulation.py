from __future__ import annotations
import logging
from api.db.repos.circulation import CirculationRepository

logger = logging.getLogger("tm-hub.jobs.collect_circulation")


async def collect_award_circulation(torn_client, db_path: str = "data/keys.db") -> None:
    """Snapshot current circulation for all honors and medals."""
    try:
        catalog = await torn_client.fetch_honor_catalog()
    except Exception as e:
        logger.error("Failed to fetch honor catalog: %s", e)
        return

    repo = CirculationRepository(db_path=db_path)
    records = []

    honors = catalog.get("honors", {})
    for hid, h in honors.items():
        circ = h.get("circulation", 0)
        if circ > 0:
            records.append((int(hid), "honor", circ))

    medals = catalog.get("medals", {})
    for mid, m in medals.items():
        circ = m.get("circulation", 0)
        if circ > 0:
            records.append((int(mid), "medal", circ))

    if records:
        repo.bulk_record(records)
        logger.info("Recorded circulation for %d awards", len(records))


async def run_collect_circulation() -> None:
    """Top-level entry point for APScheduler."""
    from api.scheduler.engine import get_state
    state = get_state()
    await collect_award_circulation(state["torn_client"])
