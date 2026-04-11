from __future__ import annotations

import logging
import time

logger = logging.getLogger("tm-hub.scheduler.armoury")


async def run_armoury_poll() -> None:
    from api.scheduler.engine import get_state
    from api.armoury import parse_deposit_news, matches_any_category

    state = get_state()
    torn_client = state.get("torn_client")
    armoury_repo = state.get("armoury_repo")
    key_repo = state.get("key_repo")

    if not torn_client or not armoury_repo:
        logger.warning("Armoury poll skipped: dependencies not ready")
        return

    competitions = armoury_repo.get_active_competitions()
    if not competitions:
        return

    now = int(time.time())
    fk = key_repo.get_faction_key() if key_repo else None
    api_key = fk["api_key"] if fk else None

    for comp in competitions:
        if now > comp["end_ts"]:
            armoury_repo.end_competition(comp["id"])
            logger.info("Auto-ended competition %d (%s)", comp["id"], comp["name"])
            continue

        from_ts = armoury_repo.get_last_poll_ts(comp["id"])
        if from_ts is None:
            from_ts = comp["start_ts"]
        else:
            from_ts += 1

        to_ts = min(now, comp["end_ts"])
        if from_ts >= to_ts:
            continue

        try:
            entries = await torn_client.fetch_armoury_deposits(from_ts, to_ts, api_key=api_key)
        except Exception as e:
            logger.error("Armoury poll failed for competition %d: %s", comp["id"], e)
            continue

        inserted = 0
        for entry in entries:
            text = entry.get("text", "")
            news_id = str(entry.get("id", ""))
            timestamp = entry.get("timestamp", 0)
            if not text or not news_id:
                continue
            parsed = parse_deposit_news(text)
            if not parsed:
                continue
            player_id, player_name, quantity, item_name = parsed
            if not matches_any_category(item_name, comp["category"]):
                continue
            armoury_repo.insert_deposit(
                competition_id=comp["id"],
                player_id=player_id,
                player_name=player_name,
                item_name=item_name,
                quantity=quantity,
                deposited_at=timestamp,
                news_id=news_id,
            )
            inserted += 1

        if inserted:
            logger.info("Competition %d (%s): inserted %d deposits from %d entries",
                        comp["id"], comp["name"], inserted, len(entries))
