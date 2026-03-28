from __future__ import annotations

import inspect
import time
from typing import Any

import httpx

from api.models import FactionMember, WarStatus, MemberBars, PersonalStats


V1_BASE = "https://api.torn.com"
V2_BASE = "https://api.torn.com/v2"
YATA_BASE = "https://yata.yt/api/v1"
YATA_CACHE_TTL = 3600


async def _json(resp: Any) -> Any:
    """Call resp.json() — handles both sync (real httpx) and async (mocks)."""
    result = resp.json()
    if inspect.isawaitable(result):
        return await result
    return result


class TornClient:
    def __init__(self, api_key: str, cache_ttl: int = 60, analytics_store=None) -> None:
        self._api_key = api_key
        self._cache_ttl = cache_ttl
        self._http = httpx.AsyncClient(timeout=15.0)
        self._cache: dict[str, tuple[float, Any]] = {}
        self._analytics = analytics_store

    async def close(self) -> None:
        await self._http.aclose()

    def _get_cached(self, key: str, ttl: int | None = None) -> Any | None:
        if key in self._cache:
            ts, data = self._cache[key]
            if time.time() - ts < (ttl if ttl is not None else self._cache_ttl):
                return data
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        self._cache[key] = (time.time(), data)

    def _log_integration(self, service: str, endpoint: str, success: bool, elapsed_ms: float, error: str | None = None) -> None:
        if self._analytics:
            try:
                self._analytics.log_integration(service, endpoint, success, elapsed_ms, error)
            except Exception:
                pass

    async def fetch_members(self) -> list[FactionMember]:
        cached = self._get_cached("members")
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/members",
                params={"key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/members", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/members", False, (time.time() - start) * 1000, str(e))
            raise
        members = [FactionMember(**m) for m in raw["members"]]
        self._set_cached("members", members)
        return members

    async def fetch_war(self) -> WarStatus | None:
        cached = self._get_cached("war")
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/",
                params={"selections": "wars", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/wars", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/wars", False, (time.time() - start) * 1000, str(e))
            raise
        ranked = raw.get("wars", {}).get("ranked")
        if not ranked:
            self._set_cached("war", None)
            return None

        war = WarStatus(**ranked)
        # War is over if there's a winner or end time has passed
        if war.winner or (war.end and war.end <= int(time.time())):
            self._set_cached("war", None)
            return None

        self._set_cached("war", war)
        return war

    async def fetch_chain(self) -> dict:
        cached = self._get_cached("chain")
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/",
                params={"selections": "chain", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/chain", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/chain", False, (time.time() - start) * 1000, str(e))
            raise
        chain = raw.get("chain", {})
        self._set_cached("chain", chain)
        return chain

    async def fetch_member_bars(self, member_key: str) -> MemberBars:
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V1_BASE}/user/",
                params={"selections": "bars,cooldowns", "key": member_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/user/bars", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/user/bars", False, (time.time() - start) * 1000, str(e))
            raise
        return MemberBars(
            energy=raw["energy"],
            happy=raw["happy"],
            cooldowns=raw["cooldowns"],
        )

    async def fetch_yata_members(self, api_key: str | None = None) -> dict | None:
        """Fetch faction members energy/drug data from YATA API.
        Returns dict keyed by member ID string, or None on error.
        """
        cached = self._get_cached("yata_members", ttl=YATA_CACHE_TTL)
        if cached is not None:
            return cached
        key = api_key or self._api_key
        start = time.time()
        try:
            resp = await self._http.get(
                f"{YATA_BASE}/faction/members/",
                params={"key": key},
                timeout=8.0,
            )
            resp.raise_for_status()
            data = await _json(resp)
            if "error" in data:
                self._log_integration("yata", "/api/v1/faction/members/", False, (time.time() - start) * 1000, "API error response")
                return None
            self._log_integration("yata", "/api/v1/faction/members/", True, (time.time() - start) * 1000)
            members = data.get("members", data)  # YATA wraps members under "members" key
            self._set_cached("yata_members", members)
            return members
        except Exception as e:
            self._log_integration("yata", "/api/v1/faction/members/", False, (time.time() - start) * 1000, str(e))
            return None

    async def fetch_enemy_members(self, faction_id: int) -> list[FactionMember]:
        cache_key = f"enemy_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/{faction_id}",
                params={"selections": "members", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", f"/v2/faction/{faction_id}/members", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", f"/v2/faction/{faction_id}/members", False, (time.time() - start) * 1000, str(e))
            raise
        members = [FactionMember(**m) for m in raw["members"]]
        self._set_cached(cache_key, members)
        return members

    async def fetch_faction_info(self, faction_id: int) -> "FactionInfo":
        from api.models import FactionInfo
        cache_key = f"finfo_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/{faction_id}",
                params={"key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", f"/v2/faction/{faction_id}", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", f"/v2/faction/{faction_id}", False, (time.time() - start) * 1000, str(e))
            raise
        basic = raw.get("basic", {})
        rank = basic.get("rank", {})
        info = FactionInfo(
            id=basic.get("id", faction_id), name=basic.get("name", "Unknown"),
            tag=basic.get("tag", ""), respect=basic.get("respect", 0),
            members_count=basic.get("members", 0), rank_name=rank.get("name", ""),
            rank_level=rank.get("level", 0), best_chain=basic.get("best_chain", 0),
            wins=rank.get("wins", 0),
        )
        self._set_cached(cache_key, info)
        return info

    async def fetch_personalstats(self, api_key: str) -> PersonalStats:
        cache_key = f"pstats_{api_key[:8]}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"{V1_BASE}/user/",
                params={"selections": "personalstats", "key": api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/user/personalstats", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/user/personalstats", False, (time.time() - start) * 1000, str(e))
            raise
        ps_raw = raw.get("personalstats", {})
        ps = PersonalStats.from_torn_api(ps_raw)
        self._set_cached(cache_key, ps)
        return ps

    async def fetch_training_data(self, api_key: str) -> dict | None:
        """Fetch user's training-related data from Torn API."""
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V1_BASE}/user/",
                params={"selections": "profile,battlestats,bars,gym,merits,education,perks,personalstats", "key": api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/user/training", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/user/training", False, (time.time() - start) * 1000, str(e))
            raise
        if "error" in raw:
            return None

        # Torn API v1 returns most fields at the top level (not nested under selection keys)
        merits = raw.get("merits", {})
        ps = raw.get("personalstats", {})
        education_completed = raw.get("education_completed", [])
        energy = raw.get("energy", {})
        happy = raw.get("happy", {})

        return {
            "profile": {
                "player_id": raw.get("player_id", 0),
                "name": raw.get("name", ""),
                "level": raw.get("level", 0),
            },
            "battlestats": {
                "strength": raw.get("strength", 0),
                "defense": raw.get("defense", 0),
                "speed": raw.get("speed", 0),
                "dexterity": raw.get("dexterity", 0),
            },
            "bars": {
                "happy": {"current": happy.get("current", 0), "maximum": happy.get("maximum", 0)},
                "energy": {"current": energy.get("current", 0), "maximum": energy.get("maximum", 0)},
            },
            "gym": {
                "active_gym": raw.get("active_gym", 0),
            },
            "merits": {
                "brawn": merits.get("Brawn", 0),
                "protection": merits.get("Protection", 0),
                "sharpness": merits.get("Sharpness", 0),
                "evasion": merits.get("Evasion", 0),
            },
            "personalstats": {
                "xantaken": ps.get("xantaken", 0),
                "refills": ps.get("refills", 0),
                "statenhancersused": ps.get("statenhancersused", 0),
                "rehabs": ps.get("rehabs", 0),
            },
            "education_completed": education_completed,
            "education_perks": raw.get("education_perks", []),
            "book_perks": raw.get("book_perks", []),
        }

    async def fetch_tornstats_spy(self, faction_id: int, ts_key: str) -> dict[int, "PersonalStats"]:
        from api.models import PersonalStats
        cache_key = f"tspy_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"https://www.tornstats.com/api/v2/{ts_key}/spy/faction/{faction_id}",
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("tornstats", f"/api/v2/spy/faction/{faction_id}", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("tornstats", f"/api/v2/spy/faction/{faction_id}", False, (time.time() - start) * 1000, str(e))
            raise
        result: dict[int, PersonalStats] = {}
        if not raw.get("status"):
            self._set_cached(cache_key, result)
            return result
        members_data = raw.get("faction", {}).get("members", {})
        for pid_str, member_data in members_data.items():
            ps_raw = member_data.get("personalstats", {})
            if ps_raw:
                result[int(pid_str)] = PersonalStats.from_tornstats(ps_raw)
        self._set_cached(cache_key, result)
        return result
