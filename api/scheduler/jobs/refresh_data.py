"""Background job to keep all data fresh.

Refreshes: attacks (chain), revives, war data, NPC loot, stock market, awards catalog.
Runs every 2 minutes. Each sub-task has its own error handling so one failure
doesn't block the others.
"""
from __future__ import annotations
import logging
import time

logger = logging.getLogger("tm-hub.jobs.refresh_data")


async def run_refresh_data() -> None:
    """Top-level entry for APScheduler."""
    from api.scheduler.engine import get_state
    state = get_state()
    torn_client = state.get("torn_client")
    attack_repo = state.get("attack_repo")
    tornstats_key = state.get("tornstats_key", "")

    if not torn_client:
        return

    start = time.time()
    refreshed = []

    # 1. Chain attacks — fetch latest from Torn API
    if attack_repo:
        try:
            from api.routers.chain import _parse_attack
            before = None
            total = 0
            for _ in range(5):  # Up to 500 attacks
                params = {"key": torn_client._api_key, "selections": "attacks", "limit": 100}
                if before:
                    params["before"] = before
                resp = await torn_client._http.get("https://api.torn.com/v2/faction", params=params)
                resp.raise_for_status()
                raw = resp.json()
                attacks = raw.get("attacks", [])
                if not attacks:
                    break
                parsed = [_parse_attack(a) for a in attacks]
                inserted = attack_repo.bulk_upsert(parsed)
                total += inserted
                if inserted < len(parsed) // 2:
                    break
                before = min(a["started"] for a in attacks)
            if total > 0:
                refreshed.append(f"attacks:{total}")
        except Exception as e:
            logger.error("Background attack refresh failed: %s", e)

    # 2. War data — keep war cache warm
    try:
        await torn_client.fetch_war_history()
        await torn_client.fetch_war()
        refreshed.append("wars")
    except Exception as e:
        logger.error("Background war refresh failed: %s", e)

    # 3. Revives — keep cache warm
    try:
        await torn_client.fetch_faction_revives()
        refreshed.append("revives")
    except Exception as e:
        logger.error("Background revive refresh failed: %s", e)

    # 4. Stock market — keep prices fresh
    try:
        await torn_client.fetch_stock_market()
        refreshed.append("stocks")
    except Exception as e:
        logger.error("Background stock refresh failed: %s", e)

    # 5. Awards catalog — refresh hourly (cached 1h in client)
    try:
        await torn_client.fetch_honor_catalog()
        refreshed.append("awards")
    except Exception as e:
        logger.error("Background awards refresh failed: %s", e)

    # 6. NPC loot — from TornStats
    if tornstats_key:
        try:
            import inspect
            resp = await torn_client._http.get(
                f"https://www.tornstats.com/api/v2/{tornstats_key}/loot",
            )
            resp.raise_for_status()
            result = resp.json()
            raw = await result if inspect.isawaitable(result) else result
            # Store in loot router cache
            from api.routers import loot as loot_mod
            npcs = []
            now = time.time()
            for key, val in raw.items():
                if key in ("status", "message", "loot") or not isinstance(val, dict):
                    continue
                try:
                    int(key)
                except ValueError:
                    continue
                npcs.append(val)
            if npcs:
                # Update the loot router's cache directly
                loot_mod._cache_ts = 0  # Force next request to use fresh data
                refreshed.append(f"loot:{len(npcs)}")
        except Exception as e:
            logger.error("Background loot refresh failed: %s", e)

    # 7. Faction members — keep member list fresh
    try:
        await torn_client.fetch_members()
        refreshed.append("members")
    except Exception as e:
        logger.error("Background members refresh failed: %s", e)

    # 8. OC crimes — keep planning data fresh
    try:
        await torn_client.fetch_faction_crimes(cat="planning")
        refreshed.append("oc")
    except Exception as e:
        logger.error("Background OC refresh failed: %s", e)

    elapsed = (time.time() - start) * 1000
    if refreshed:
        logger.info("Background refresh done in %.0fms: %s", elapsed, ", ".join(refreshed))
