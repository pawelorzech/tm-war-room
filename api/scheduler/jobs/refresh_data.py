"""Background job to keep all data fresh.

Runs every 30 seconds. During active war: refreshes everything (attacks, war,
members, revives). During peacetime: skips expensive operations on some cycles
to save API rate limits. War detection stored globally for /api/status endpoint.
"""
from __future__ import annotations
import logging
import time

logger = logging.getLogger("tm-hub.jobs.refresh_data")

# Global state for adaptive polling
war_active: bool = False
last_full_refresh: float = 0
_cycle: int = 0


async def run_refresh_data() -> None:
    """Top-level entry for APScheduler. Runs every 30s."""
    global war_active, last_full_refresh, _cycle
    from api.scheduler.engine import get_state
    state = get_state()
    torn_client = state.get("torn_client")
    attack_repo = state.get("attack_repo")
    tornstats_key = state.get("tornstats_key", "")

    if not torn_client:
        return

    _cycle += 1
    start = time.time()
    refreshed = []

    # Always check war status (cheap, cached)
    try:
        war = await torn_client.fetch_war()
        war_active = war is not None
        refreshed.append("war_check")
    except Exception as e:
        logger.error("War check failed: %s", e)

    # Decide what to refresh this cycle
    # War active: refresh critical data every cycle (30s)
    # Peacetime: refresh critical every cycle, expensive every 4th cycle (~2min)
    is_full_cycle = war_active or (_cycle % 4 == 0)

    # 1. Members — always (30s during war, 2min peacetime)
    if war_active or _cycle % 2 == 0:
        try:
            await torn_client.fetch_members()
            refreshed.append("members")
        except Exception as e:
            logger.error("Background members refresh failed: %s", e)

    # 2. Attacks — always during war, every 2nd cycle peacetime
    if attack_repo and (war_active or _cycle % 2 == 0):
        try:
            from api.routers.chain import _parse_attack
            before = None
            total = 0
            max_pages = 5 if war_active else 2
            for _ in range(max_pages):
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

    # 3. War history — during war or full cycle
    if war_active or is_full_cycle:
        try:
            await torn_client.fetch_war_history()
            refreshed.append("wars")
        except Exception as e:
            logger.error("Background war refresh failed: %s", e)

    # 4. Revives — during war or full cycle
    if war_active or is_full_cycle:
        try:
            await torn_client.fetch_faction_revives()
            refreshed.append("revives")
        except Exception as e:
            logger.error("Background revive refresh failed: %s", e)

    # 5. Stocks — full cycle only (every 2min)
    if is_full_cycle:
        try:
            await torn_client.fetch_stock_market()
            refreshed.append("stocks")
        except Exception as e:
            logger.error("Background stock refresh failed: %s", e)

    # 5b. Market items — every 8th cycle (~4min, cached 5min in router)
    if _cycle % 8 == 1:
        try:
            from api.torn_client import _json
            resp = await torn_client._http.get(
                "https://api.torn.com/torn/",
                params={"selections": "items", "key": torn_client._api_key},
            )
            resp.raise_for_status()
            refreshed.append("market_items")
        except Exception as e:
            logger.error("Background market refresh failed: %s", e)

    # 6. Awards catalog — every 8th cycle (~4min)
    if _cycle % 8 == 0:
        try:
            await torn_client.fetch_honor_catalog()
            refreshed.append("awards")
        except Exception as e:
            logger.error("Background awards refresh failed: %s", e)

    # 7. NPC loot — every 2nd cycle (~1min) + auto-reset reservations
    if tornstats_key and _cycle % 2 == 0:
        try:
            import inspect
            resp = await torn_client._http.get(
                f"https://www.tornstats.com/api/v2/{tornstats_key}/loot",
            )
            resp.raise_for_status()
            result = resp.json()
            raw = await result if inspect.isawaitable(result) else result
            from api.routers import loot as loot_mod
            npcs = []
            for key, val in raw.items():
                if key in ("status", "message", "loot") or not isinstance(val, dict):
                    continue
                try:
                    npc_id = int(key)
                except ValueError:
                    continue
                npcs.append(val)
                # Auto-reset reservations when NPC is in hospital
                npc_status = (val.get("status") or "").lower()
                if "hosp" in npc_status and loot_mod.reservation_repo:
                    existing = loot_mod.reservation_repo.get_for_npc(npc_id)
                    if existing:
                        loot_mod.reservation_repo.clear_npc(npc_id)
                        logger.info("Auto-cleared %d reservations for NPC %s (hospitalized)",
                                    len(existing), val.get("name", npc_id))
            if npcs:
                loot_mod._cache_ts = 0
                refreshed.append(f"loot:{len(npcs)}")
        except Exception as e:
            logger.error("Background loot refresh failed: %s", e)

    # 8. OC — full cycle only
    if is_full_cycle:
        try:
            await torn_client.fetch_faction_crimes(cat="planning")
            refreshed.append("oc")
        except Exception as e:
            logger.error("Background OC refresh failed: %s", e)

    # 9. Stakeouts — check watched players every cycle during war, every 4th peacetime
    if war_active or _cycle % 4 == 0:
        try:
            from api.routers.stakeout import stakeout_repo
            if stakeout_repo:
                watched = stakeout_repo.get_all()
                if watched:
                    from api.torn_client import _json
                    changes = 0
                    for w in watched[:20]:  # Max 20 per cycle to save API calls
                        try:
                            resp = await torn_client._http.get(
                                "https://api.torn.com/user/",
                                params={"selections": "profile", "key": torn_client._api_key, "id": w["player_id"]},
                            )
                            if resp.status_code == 200:
                                data = await _json(resp) if hasattr(resp, 'json') else resp.json()
                                status_desc = data.get("status", {}).get("description", "Unknown") if isinstance(data.get("status"), dict) else str(data.get("status", "Unknown"))
                                last_action = data.get("last_action", {}).get("relative", "") if isinstance(data.get("last_action"), dict) else ""
                                name = data.get("name", "")
                                changed = stakeout_repo.update_status(w["player_id"], status_desc, last_action, name or None)
                                if changed:
                                    changes += 1
                        except Exception:
                            pass
                    if changes > 0:
                        refreshed.append(f"stakeouts:{changes}changes")
                    elif watched:
                        refreshed.append(f"stakeouts:{len(watched)}checked")
        except Exception as e:
            logger.error("Background stakeout check failed: %s", e)

    elapsed = (time.time() - start) * 1000
    last_full_refresh = time.time()
    if refreshed:
        mode = "WAR" if war_active else "peace"
        logger.info("[%s] Refresh #%d in %.0fms: %s", mode, _cycle, elapsed, ", ".join(refreshed))
