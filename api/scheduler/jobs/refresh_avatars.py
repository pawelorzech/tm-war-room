from __future__ import annotations
import asyncio
import logging
import time

from api.scheduler.jobs._log_helpers import with_sentry_capture

logger = logging.getLogger("tm-hub.scheduler.avatars")

REFETCH_INTERVAL = 11 * 3600  # 11h — skip if fetched less than this ago


@with_sentry_capture("refresh_avatars")
async def run_refresh_avatars() -> None:
    """Fetch Torn profile images for all registered members and upload to B2."""
    from api.scheduler.engine import get_state
    from api import b2_client

    if not b2_client.is_configured():
        logger.debug("B2 not configured — skipping avatar refresh")
        return

    state = get_state()
    key_repo = state.get("key_repo")
    torn_client = state.get("torn_client")

    if not key_repo or not torn_client:
        logger.warning("Avatar refresh: key_repo or torn_client not in state")
        return

    faction_key_info = key_repo.get_faction_key()
    if faction_key_info:
        api_key = faction_key_info["api_key"]
    else:
        import os
        api_key = os.getenv("TORN_API_KEY", "")
        if not api_key:
            logger.warning("Avatar refresh: no faction key and no TORN_API_KEY")
            return
    all_keys = key_repo.get_all_keys()
    now = int(time.time())

    loop = asyncio.get_event_loop()
    updated = 0

    for member in all_keys:
        player_id = member["player_id"]

        # Check if recently fetched (via raw SQL)
        import sqlite3
        conn = sqlite3.connect(key_repo._db_path)
        row = conn.execute(
            "SELECT avatar_fetched_at FROM member_keys WHERE player_id = ?", (player_id,)
        ).fetchone()
        conn.close()
        if row and row[0] and (now - row[0]) < REFETCH_INTERVAL:
            continue

        try:
            resp = await torn_client._http.get(
                f"https://api.torn.com/v2/user/{player_id}",
                params={"selections": "profile", "key": api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            if hasattr(data, "__await__"):
                data = await data

            profile_image_url = data.get("profile_image")
            if not profile_image_url:
                continue

            # Download image
            img_resp = await torn_client._http.get(profile_image_url)
            img_resp.raise_for_status()
            img_data = img_resp.content

            # Upload to B2 in thread pool (b2sdk is sync)
            remote_path = f"avatars/{player_id}.jpg"
            b2_url = await loop.run_in_executor(
                None,
                lambda p=remote_path, d=img_data: b2_client.upload_bytes(p, d, "image/jpeg"),
            )

            key_repo.set_avatar(player_id, b2_url, now)
            updated += 1
            logger.info("Avatar updated for player %d → %s", player_id, b2_url)

        except Exception as exc:
            logger.warning("Avatar refresh failed for player %d: %s", player_id, exc)

    logger.info("Avatar refresh complete: %d updated out of %d", updated, len(all_keys))
