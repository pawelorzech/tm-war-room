"""Background job to keep all data fresh.

Runs every 30 seconds. During active war: refreshes everything (attacks, war,
members, revives). During peacetime: skips expensive operations on some cycles
to save API rate limits. War detection stored globally for /api/status endpoint.
"""
from __future__ import annotations
import asyncio
import logging
import time

from api.scheduler.jobs._log_helpers import log_job_error, report_job_error, with_sentry_capture

logger = logging.getLogger("tm-hub.jobs.refresh_data")

# Global state for adaptive polling
war_active: bool = False
last_full_refresh: float = 0
_cycle: int = 0

# Limit concurrent Torn API calls for bars fan-out (10 at a time, not 70+)
_BARS_SEM = asyncio.Semaphore(10)

# Track NPC levels between cycles for push notification triggers
_prev_npc_levels: dict[int, int] = {}


def _check_loot_push(npcs: list[dict], push_service, dispatcher=None) -> None:
    """Check if any NPC crossed from <4 to >=4 and send push notifications."""
    global _prev_npc_levels
    for npc in npcs:
        npc_id = npc.get("id", 0)
        level = npc.get("level", 0)
        name = npc.get("name", f"NPC #{npc_id}")
        prev = _prev_npc_levels.get(npc_id, 0)
        if prev < 4 and level >= 4:
            if dispatcher:
                dispatcher.send(
                    title=f"{name} — Loot Level {level}!",
                    body=f"{name} reached Level {level}. Time to attack for high-value loot!",
                    url="/loot",
                    target_type="preference",
                    target_value="loot_level4",
                    sent_by="system",
                )
            elif push_service:
                push_service.dispatch(
                    "loot_level4",
                    f"{name} — Loot Level {level}!",
                    f"{name} reached Level {level}. Time to attack for high-value loot!",
                    "/loot",
                )
        _prev_npc_levels[npc_id] = level


@with_sentry_capture("refresh_data")
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
        log_job_error(logger, "War check failed: %s", e)

    # Notify on war state change
    prev_war = state.get("_prev_war_active", None)
    if prev_war is not None and prev_war != war_active:
        push_svc = state.get("push_service")
        dispatcher = state.get("notification_dispatcher")
        if war_active:
            if dispatcher:
                dispatcher.send(
                    title="War Started!",
                    body="An active war has been detected. Get ready for battle!",
                    url="/wars",
                    target_type="preference",
                    target_value="war_start",
                    sent_by="system",
                )
            elif push_svc:
                push_svc.dispatch("war_start", "War Started!", "An active war has been detected. Get ready for battle!", "/wars")
    state["_prev_war_active"] = war_active

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
            log_job_error(logger, "Background members refresh failed: %s", e)

    # 1b. Record activity snapshot (daily, on full cycles)
    if is_full_cycle:
        try:
            history_repo = state.get("history_repo")
            members = await torn_client.fetch_members()
            if history_repo and members:
                total = len(members)
                online = sum(1 for m in members if getattr(m, 'last_action', None) and
                             hasattr(m.last_action, 'status') and m.last_action.status == 'Online')
                hospital = sum(1 for m in members if hasattr(m, 'status') and
                               hasattr(m.status, 'state') and m.status.state == 'Hospital')
                traveling = sum(1 for m in members if hasattr(m, 'status') and
                                hasattr(m.status, 'state') and m.status.state in ('Traveling', 'Abroad'))
                history_repo.record_activity_snapshot(total, online, hospital, traveling)
        except Exception as e:
            log_job_error(logger, "Activity snapshot failed: %s", e)

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
            report_job_error(logger, "Background attack refresh failed: %s", e, job="refresh_data:attack")

    # 3. War history — during war or full cycle
    if war_active or is_full_cycle:
        try:
            await torn_client.fetch_war_history()
            refreshed.append("wars")
        except Exception as e:
            log_job_error(logger, "Background war refresh failed: %s", e)

    # 4. Revives — during war or full cycle
    if war_active or is_full_cycle:
        try:
            await torn_client.fetch_faction_revives()
            refreshed.append("revives")
        except Exception as e:
            log_job_error(logger, "Background revive refresh failed: %s", e)

    # 5. Stocks — full cycle only (every 2min) + record history
    if is_full_cycle:
        try:
            stocks = await torn_client.fetch_stock_market()
            refreshed.append("stocks")
            # Record stock price history
            history_repo = state.get("history_repo")
            if history_repo and isinstance(stocks, dict) and _cycle % 8 == 0:
                prices = []
                for sid, s in stocks.items():
                    try:
                        prices.append((int(sid), s.get("current_price", 0)))
                    except (ValueError, AttributeError):
                        pass
                if prices:
                    history_repo.record_stock_prices_bulk(prices)
                    refreshed.append(f"stock_hist:{len(prices)}")
        except Exception as e:
            report_job_error(logger, "Background stock refresh failed: %s", e, job="refresh_data:stock")

    # 5b. Market items — every 8th cycle (~4min, cached 5min in router)
    if _cycle % 8 == 1:
        try:
            from api.torn_client import _json
            # v1 (dict keyed by item id) — see comment in routers/market.py
            resp = await torn_client._http.get(
                "https://api.torn.com/torn/",
                params={"selections": "items", "key": torn_client._api_key},
            )
            resp.raise_for_status()
            refreshed.append("market_items")
        except Exception as e:
            report_job_error(logger, "Background market refresh failed: %s", e, job="refresh_data:market")

    # 6. Awards catalog — every 8th cycle (~4min)
    if _cycle % 8 == 0:
        try:
            await torn_client.fetch_honor_catalog()
            refreshed.append("awards")
        except Exception as e:
            report_job_error(logger, "Background awards refresh failed: %s", e, job="refresh_data:awards")

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
                push_svc = state.get("push_service")
                dispatcher = state.get("notification_dispatcher")
                if npcs:
                    npc_parsed = []
                    for key2, val2 in raw.items():
                        if key2 in ("status", "message", "loot") or not isinstance(val2, dict):
                            continue
                        try:
                            npc_parsed.append({"id": int(key2), "name": val2.get("name", ""), "level": val2.get("level", 0)})
                        except ValueError:
                            pass
                    _check_loot_push(npc_parsed, push_svc, dispatcher=dispatcher)
                refreshed.append(f"loot:{len(npcs)}")
        except Exception as e:
            report_job_error(logger, "Background loot refresh failed: %s", e, job="refresh_data:loot")

    # 7b. Member bars — every cycle during war, every 2nd peacetime
    if war_active or _cycle % 2 == 0:
        try:
            key_repo = state.get("key_repo")
            if key_repo and torn_client:
                pairs = key_repo.get_all_player_ids_with_keys()

                async def _bg_bars(pid: int, enc_key) -> tuple[int, dict | None]:
                    async with _BARS_SEM:
                        try:
                            api_key = key_repo.decrypt_key(enc_key)
                            bars = await torn_client.fetch_member_bars(api_key)
                            return pid, {
                                "energy": bars.energy.current,
                                "max_energy": bars.energy.maximum,
                                "drug_cd": bars.cooldowns.drug,
                            }
                        except Exception:
                            return pid, None

                results = await asyncio.gather(*[_bg_bars(pid, enc) for pid, enc in pairs])
                from api.main import _bars_cache
                import time as _t
                from api import main as _main_mod
                for pid, data in results:
                    if data is not None:
                        _bars_cache[pid] = data
                _main_mod._bars_cache_ts = _t.time()
                refreshed.append(f"bars:{sum(1 for _, d in results if d)}/{len(pairs)}")
        except Exception as e:
            report_job_error(logger, "Background bars refresh failed: %s", e, job="refresh_data:bars")

    # 8. OC — full cycle only
    if is_full_cycle:
        try:
            await torn_client.fetch_faction_crimes(cat="planning")
            refreshed.append("oc")
        except Exception as e:
            report_job_error(logger, "Background OC refresh failed: %s", e, job="refresh_data:oc")

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
                            # v1 profile (consumer reads flat last_action/status/name fields).
                            # NB: target id must be in the URL path. v1 ignores `?id=`
                            # query params and returns the key owner's profile instead.
                            resp = await torn_client._http.get(
                                f"https://api.torn.com/user/{w['player_id']}",
                                params={"selections": "profile", "key": torn_client._api_key},
                            )
                            if resp.status_code == 200:
                                data = await _json(resp) if hasattr(resp, 'json') else resp.json()
                                status_desc = data.get("status", {}).get("description", "Unknown") if isinstance(data.get("status"), dict) else str(data.get("status", "Unknown"))
                                last_action = data.get("last_action", {}).get("relative", "") if isinstance(data.get("last_action"), dict) else ""
                                name = data.get("name", "")
                                changed = stakeout_repo.update_status(w["player_id"], status_desc, last_action, name or None)
                                if changed:
                                    changes += 1
                                    pname = name or w.get("player_name") or f"#{w['player_id']}"
                                    push_svc = state.get("push_service")
                                    dispatcher = state.get("notification_dispatcher")
                                    added_by = w.get("added_by", 0)
                                    if dispatcher and added_by:
                                        dispatcher.send(
                                            title=f"{pname} is now {status_desc}",
                                            body=f"Stakeout alert: {pname} changed status",
                                            url="/stakeout",
                                            target_type="player",
                                            target_value=str(added_by),
                                            sent_by="system",
                                        )
                                    elif push_svc and added_by:
                                        push_svc.dispatch_to_player(
                                            added_by,
                                            "stakeout_change",
                                            f"{pname} is now {status_desc}",
                                            f"Stakeout alert: {pname} changed status",
                                            "/stakeout",
                                        )
                        except Exception:
                            pass
                    if changes > 0:
                        refreshed.append(f"stakeouts:{changes}changes")
                    elif watched:
                        refreshed.append(f"stakeouts:{len(watched)}checked")
        except Exception as e:
            report_job_error(logger, "Background stakeout check failed: %s", e, job="refresh_data:stakeout")

    elapsed = (time.time() - start) * 1000
    last_full_refresh = time.time()
    if refreshed:
        mode = "WAR" if war_active else "peace"
        logger.info("[%s] Refresh #%d in %.0fms: %s", mode, _cycle, elapsed, ", ".join(refreshed))
