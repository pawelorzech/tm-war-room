from __future__ import annotations

import asyncio
import logging
from datetime import date

from api.db.repos.companies import CompanySnapshotRepository
from api.db.repos.keys import KeyRepository
from api.db.repos.tracked_companies import TrackedCompaniesRepository

logger = logging.getLogger("tm-hub.jobs.collect_company_snapshots")

_PUBLIC_PROFILE_CONCURRENCY = 5


async def _snapshot_for_key(
    entry: dict,
    today: str,
    companies_repo: CompanySnapshotRepository,
    tracked_repo: TrackedCompaniesRepository,
    torn_client,
) -> int:
    """Snapshot one director's company. Returns company_id on success, 0 otherwise.
    Non-directors (detailed returns None) are silently skipped — they're just employees."""
    api_key = entry["api_key"]

    detailed = await torn_client.fetch_company_detailed(api_key)
    if detailed is None:
        return 0  # not a director

    training = await torn_client.fetch_training_data(api_key)
    company_id = 0
    company_name = ""
    company_type = 0
    if training and isinstance(training.get("job"), dict):
        job = training["job"]
        company_id = int(job.get("company_id") or 0)
        company_name = job.get("company_name") or ""
        company_type = int(job.get("company_type") or 0)
    if not company_id:
        logger.warning("Director %s has no company_id in training data — skipping", entry["player_id"])
        return 0

    profile_raw = await torn_client.fetch_company_profile(company_id, api_key)
    profile = (profile_raw or {}).get("company") if profile_raw else None

    companies_repo.insert_snapshot(
        company_id=company_id,
        snapshot_date=today,
        detailed=detailed,
        profile=profile,
        scope="director",
    )

    tracked_repo.upsert(
        company_id=company_id,
        company_type=company_type or (profile or {}).get("company_type"),
        rating=(profile or {}).get("rating"),
        name=company_name or (profile or {}).get("name"),
        director_id=entry["player_id"],
        source="faction",
    )

    # Employee snapshot
    employees_raw = await torn_client.fetch_company_employees(api_key)
    employees = (employees_raw or {}).get("company_employees", {}) if employees_raw else {}
    for pid_str, emp in employees.items():
        try:
            pid = int(pid_str)
        except (ValueError, TypeError):
            continue
        companies_repo.insert_employee_snapshot(
            company_id=company_id,
            player_id=pid,
            snapshot_date=today,
            employee=emp,
        )

    # Stock snapshot
    stock_raw = await torn_client.fetch_company_stock(api_key)
    stock = (stock_raw or {}).get("company_stock", {}) if stock_raw else {}
    for product_name, item in stock.items():
        companies_repo.insert_stock_snapshot(
            company_id=company_id,
            product_name=product_name,
            snapshot_date=today,
            item=item,
        )

    return company_id


async def _snapshot_public(
    company_id: int,
    today: str,
    viewer_key: str,
    companies_repo: CompanySnapshotRepository,
    tracked_repo: TrackedCompaniesRepository,
    torn_client,
    semaphore: asyncio.Semaphore,
) -> bool:
    """Fetch public profile for a tracked (non-director-we-have) company and
    upsert as scope='public'. Returns True on success."""
    async with semaphore:
        profile_raw = await torn_client.fetch_company_profile(company_id, viewer_key)
    profile = (profile_raw or {}).get("company") if profile_raw else None
    if not profile:
        return False
    companies_repo.insert_snapshot(
        company_id=company_id,
        snapshot_date=today,
        detailed=None,
        profile=profile,
        scope="public",
    )
    tracked_repo.upsert(
        company_id=company_id,
        company_type=profile.get("company_type"),
        rating=profile.get("rating"),
        name=profile.get("name"),
        director_id=None,
        source="discovered",  # no-op if already seeded
    )
    return True


async def collect_company_snapshots(
    key_repo: KeyRepository,
    companies_repo: CompanySnapshotRepository,
    tracked_repo: TrackedCompaniesRepository,
    torn_client,
) -> None:
    """Two-pass snapshot collection:
      1. Directors → full (detailed + employees + stock + profile) rows, scope='director'
      2. All other tracked companies → public profile only, scope='public' (for ranking)
    """
    all_keys = key_repo.get_all_keys()
    today = date.today().isoformat()
    director_ids: set[int] = set()
    for entry in all_keys:
        try:
            cid = await _snapshot_for_key(entry, today, companies_repo, tracked_repo, torn_client)
            if cid:
                director_ids.add(cid)
        except Exception as e:
            logger.error(
                "Error snapshotting director company for player %d: %s", entry["player_id"], e
            )

    # Pass 2 — other tracked companies (public profile only)
    tracked = tracked_repo.list_all()
    to_fetch = [t for t in tracked if t["company_id"] not in director_ids]
    if not to_fetch:
        logger.info(
            "Collected company snapshots: %d directors / %d keys (no public competitors to poll)",
            len(director_ids), len(all_keys),
        )
        return

    faction_key_entry = key_repo.get_faction_key()
    viewer_key = (faction_key_entry or {}).get("api_key") or (all_keys[0]["api_key"] if all_keys else None)
    if not viewer_key:
        logger.warning("No API key available for public profile snapshots")
        return

    semaphore = asyncio.Semaphore(_PUBLIC_PROFILE_CONCURRENCY)
    results = await asyncio.gather(
        *(
            _snapshot_public(t["company_id"], today, viewer_key, companies_repo, tracked_repo, torn_client, semaphore)
            for t in to_fetch
        ),
        return_exceptions=True,
    )
    public_ok = sum(1 for r in results if r is True)
    public_fail = sum(1 for r in results if isinstance(r, BaseException) or r is False)
    logger.info(
        "Collected company snapshots: %d directors / %d keys, %d public / %d failures",
        len(director_ids), len(all_keys), public_ok, public_fail,
    )


async def run_collect_company_snapshots() -> None:
    """Top-level entry point for APScheduler."""
    from api.scheduler.engine import get_state

    state = get_state()
    await collect_company_snapshots(
        state["key_repo"],
        state["companies_repo"],
        state["tracked_companies_repo"],
        state["torn_client"],
    )
