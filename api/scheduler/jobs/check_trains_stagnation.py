from __future__ import annotations

import logging
import time

from api.db.repos.companies import CompanySnapshotRepository
from api.db.repos.company_alerts import CompanyAlertConfigRepository
from api.db.repos.notifications import NotificationRepository

logger = logging.getLogger("tm-hub.jobs.check_trains_stagnation")

ALERT_TYPE = "company_trains_stagnant"
# Deduplication: don't ping the same player for the same company again within
# this many seconds. 24h keeps the noise down while still firing daily if the
# trains are genuinely being ignored.
DEDUP_WINDOW = 24 * 3600


def _last_alert_ts(
    notification_repo: NotificationRepository,
    player_id: int,
    company_id: int,
) -> int:
    rows = notification_repo.execute(
        """
        SELECT created_at, data FROM notifications
        WHERE player_id = ? AND type = ?
        ORDER BY created_at DESC
        LIMIT 20
        """,
        (player_id, ALERT_TYPE),
    )
    import json
    for r in rows:
        try:
            d = json.loads(r["data"] or "{}")
        except (ValueError, TypeError):
            continue
        if int(d.get("company_id", 0)) == company_id:
            return int(r["created_at"])
    return 0


def _stagnant_days(series: list[dict], threshold: int) -> int:
    """Count how many of the MOST RECENT consecutive daily snapshots had
    trains_available > 0. Returns 0 if trains dropped to 0 at any point."""
    count = 0
    for row in reversed(series):
        if (row.get("trains_available") or 0) > 0:
            count += 1
        else:
            break
    return count


def check_trains_stagnation(
    companies_repo: CompanySnapshotRepository,
    alert_repo: CompanyAlertConfigRepository,
    notification_repo: NotificationRepository,
) -> None:
    """For every company that configured `trains_stagnant` alerts, check if
    trains_available has been >0 for at least `threshold_days` consecutive days.
    If so, ping every configured target_player_id (dedup: 24h per company)."""
    configs = alert_repo.list_by_type(ALERT_TYPE)
    if not configs:
        logger.info("No trains_stagnant alert configs — nothing to do")
        return

    # Group by company to batch reads
    by_company: dict[int, list[dict]] = {}
    for c in configs:
        by_company.setdefault(c["company_id"], []).append(c)

    now = int(time.time())
    sent = 0
    skipped_dedup = 0
    skipped_threshold = 0

    for company_id, cfgs in by_company.items():
        # Use the max threshold among configs so we fetch enough history
        max_threshold = max(c["threshold_days"] for c in cfgs)
        series = companies_repo.get_trains_available_series(company_id, days=max(14, max_threshold + 3))
        stagnant = _stagnant_days(series, max_threshold)

        for cfg in cfgs:
            if stagnant < cfg["threshold_days"]:
                skipped_threshold += 1
                continue
            last_ts = _last_alert_ts(notification_repo, cfg["target_player_id"], company_id)
            if now - last_ts < DEDUP_WINDOW:
                skipped_dedup += 1
                continue
            current_trains = (series[-1].get("trains_available") if series else 0) or 0
            notification_repo.create(
                player_id=cfg["target_player_id"],
                type=ALERT_TYPE,
                title=f"Company trains unused ({stagnant}d)",
                message=(
                    f"Your company has had {current_trains} training credit(s) "
                    f"available for {stagnant} day(s). Use them — they don't carry value if wasted."
                ),
                data={
                    "company_id": company_id,
                    "trains_available": current_trains,
                    "stagnant_days": stagnant,
                },
            )
            sent += 1

    logger.info(
        "Trains stagnation check: sent=%d skipped_dedup=%d skipped_threshold=%d companies=%d",
        sent, skipped_dedup, skipped_threshold, len(by_company),
    )


async def run_check_trains_stagnation() -> None:
    """Top-level entry point for APScheduler."""
    from api.scheduler.engine import get_state

    state = get_state()
    check_trains_stagnation(
        state["companies_repo"],
        state["company_alerts_repo"],
        state["notification_repo"],
    )
