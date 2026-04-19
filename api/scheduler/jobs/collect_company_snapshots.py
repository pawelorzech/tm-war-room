from __future__ import annotations

import logging
from datetime import date

from api.db.repos.companies import CompanySnapshotRepository
from api.db.repos.keys import KeyRepository

logger = logging.getLogger("tm-hub.jobs.collect_company_snapshots")


async def _snapshot_for_key(
    entry: dict,
    today: str,
    companies_repo: CompanySnapshotRepository,
    torn_client,
) -> bool:
    """Snapshot one director's company. Returns True if we wrote something.
    Non-directors (detailed returns None) are silently skipped — they're just employees."""
    api_key = entry["api_key"]

    detailed = await torn_client.fetch_company_detailed(api_key)
    if detailed is None:
        return False  # not a director

    # Company id + profile: grab from training for id, then public profile call for numbers
    training = await torn_client.fetch_training_data(api_key)
    company_id = 0
    if training and isinstance(training.get("job"), dict):
        company_id = int(training["job"].get("company_id") or 0)
    if not company_id:
        logger.warning("Director %s has no company_id in training data — skipping", entry["player_id"])
        return False

    profile_raw = await torn_client.fetch_company_profile(company_id, api_key)
    profile = (profile_raw or {}).get("company") if profile_raw else None

    companies_repo.insert_snapshot(
        company_id=company_id,
        snapshot_date=today,
        detailed=detailed,
        profile=profile,
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

    return True


async def collect_company_snapshots(
    key_repo: KeyRepository,
    companies_repo: CompanySnapshotRepository,
    torn_client,
) -> None:
    """Walk every stored key, try director calls, snapshot on success."""
    all_keys = key_repo.get_all_keys()
    today = date.today().isoformat()
    collected = 0
    for entry in all_keys:
        try:
            ok = await _snapshot_for_key(entry, today, companies_repo, torn_client)
            if ok:
                collected += 1
        except Exception as e:
            logger.error(
                "Error snapshotting company for player %d: %s", entry["player_id"], e
            )
    logger.info(
        "Collected company snapshots: %d directors / %d keys", collected, len(all_keys)
    )


async def run_collect_company_snapshots() -> None:
    """Top-level entry point for APScheduler."""
    from api.scheduler.engine import get_state

    state = get_state()
    await collect_company_snapshots(
        state["key_repo"], state["companies_repo"], state["torn_client"]
    )
