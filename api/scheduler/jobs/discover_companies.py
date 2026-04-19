from __future__ import annotations

import asyncio
import logging

from api.db.repos.keys import KeyRepository
from api.db.repos.tracked_companies import TrackedCompaniesRepository

logger = logging.getLogger("tm-hub.jobs.discover_companies")

# How many sequential company IDs to probe per run. Rate-limited so we don't
# burn Torn API budget. 100 IDs/day × ~30 days ≈ 3000 IDs scanned/month.
SCAN_BATCH_SIZE = 100
# Concurrency when probing — each request is a lightweight `profile` call.
SCAN_CONCURRENCY = 5
# Torn's highest-rated farms (class 10) are what we care about most. We don't
# filter by rating at probe time (profile is returned regardless), but we only
# RECORD class-10 companies to keep the table tight.
TARGET_RATING = 10

# When we reach this ID without new hits, reset to 1 and rescan (companies get
# deleted and re-created over time, so staying stale hurts us).
MAX_SCAN_ID = 100_000


async def _probe_one(
    company_id: int,
    viewer_key: str,
    tracked_repo: TrackedCompaniesRepository,
    torn_client,
    semaphore: asyncio.Semaphore,
) -> bool:
    """Probe a single company_id. Returns True if it was recorded as class-10."""
    async with semaphore:
        raw = await torn_client.fetch_company_profile(company_id, viewer_key)
    if not raw or not isinstance(raw, dict):
        return False
    company = raw.get("company")
    if not isinstance(company, dict):
        return False
    rating = company.get("rating")
    if rating != TARGET_RATING:
        return False
    tracked_repo.upsert(
        company_id=company_id,
        company_type=company.get("company_type"),
        rating=rating,
        name=company.get("name"),
        director_id=company.get("director"),
        source="discovered",
    )
    return True


async def discover_companies(
    key_repo: KeyRepository,
    tracked_repo: TrackedCompaniesRepository,
    torn_client,
) -> None:
    """Probe SCAN_BATCH_SIZE sequential company IDs starting after the last cursor.
    Records any class-10 companies found so the daily snapshot job picks them up."""
    all_keys = key_repo.get_all_keys()
    if not all_keys:
        logger.info("No API keys — skipping company discovery")
        return
    faction_key_entry = key_repo.get_faction_key()
    viewer_key = (faction_key_entry or {}).get("api_key") or all_keys[0]["api_key"]

    cursor = tracked_repo.get_discovery_cursor()
    start = cursor + 1
    end = start + SCAN_BATCH_SIZE
    # Wrap around once we've scanned the full range
    if start > MAX_SCAN_ID:
        start = 1
        end = start + SCAN_BATCH_SIZE
        logger.info("Company discovery cursor wrapped to 1")

    semaphore = asyncio.Semaphore(SCAN_CONCURRENCY)
    results = await asyncio.gather(
        *(
            _probe_one(cid, viewer_key, tracked_repo, torn_client, semaphore)
            for cid in range(start, end)
        ),
        return_exceptions=True,
    )
    hits = sum(1 for r in results if r is True)
    errors = sum(1 for r in results if isinstance(r, BaseException))
    tracked_repo.set_discovery_cursor(end - 1)
    logger.info(
        "Company discovery: scanned ids %d..%d, class-10 hits=%d, errors=%d, cursor=%d",
        start, end - 1, hits, errors, end - 1,
    )


async def run_discover_companies() -> None:
    """Top-level entry point for APScheduler."""
    from api.scheduler.engine import get_state

    state = get_state()
    await discover_companies(
        state["key_repo"],
        state["tracked_companies_repo"],
        state["torn_client"],
    )
