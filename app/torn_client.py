from __future__ import annotations

import inspect
import time
from typing import Any

import httpx

from app.models import FactionMember, WarStatus, MemberBars


V1_BASE = "https://api.torn.com"
V2_BASE = "https://api.torn.com/v2"


async def _json(resp: Any) -> Any:
    """Call resp.json() — handles both sync (real httpx) and async (mocks)."""
    result = resp.json()
    if inspect.isawaitable(result):
        return await result
    return result


class TornClient:
    def __init__(self, api_key: str, cache_ttl: int = 60) -> None:
        self._api_key = api_key
        self._cache_ttl = cache_ttl
        self._http = httpx.AsyncClient(timeout=15.0)
        self._cache: dict[str, tuple[float, Any]] = {}

    async def close(self) -> None:
        await self._http.aclose()

    def _get_cached(self, key: str) -> Any | None:
        if key in self._cache:
            ts, data = self._cache[key]
            if time.time() - ts < self._cache_ttl:
                return data
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        self._cache[key] = (time.time(), data)

    async def fetch_members(self) -> list[FactionMember]:
        cached = self._get_cached("members")
        if cached is not None:
            return cached

        resp = await self._http.get(
            f"{V2_BASE}/faction/members",
            params={"key": self._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        members = [FactionMember(**m) for m in raw["members"]]
        self._set_cached("members", members)
        return members

    async def fetch_war(self) -> WarStatus | None:
        cached = self._get_cached("war")
        if cached is not None:
            return cached

        resp = await self._http.get(
            f"{V2_BASE}/faction/",
            params={"selections": "wars", "key": self._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        ranked = raw.get("wars", {}).get("ranked")
        if not ranked:
            self._set_cached("war", None)
            return None

        war = WarStatus(**ranked)
        self._set_cached("war", war)
        return war

    async def fetch_member_bars(self, member_key: str) -> MemberBars:
        resp = await self._http.get(
            f"{V1_BASE}/user/",
            params={"selections": "bars,cooldowns", "key": member_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        return MemberBars(
            energy=raw["energy"],
            happy=raw["happy"],
            cooldowns=raw["cooldowns"],
        )

    async def fetch_enemy_members(self, faction_id: int) -> list[FactionMember]:
        cache_key = f"enemy_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached
        resp = await self._http.get(
            f"{V2_BASE}/faction/{faction_id}",
            params={"selections": "members", "key": self._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        members = [FactionMember(**m) for m in raw["members"]]
        self._set_cached(cache_key, members)
        return members

    async def fetch_faction_info(self, faction_id: int) -> "FactionInfo":
        from app.models import FactionInfo
        cache_key = f"finfo_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached
        resp = await self._http.get(
            f"{V2_BASE}/faction/{faction_id}",
            params={"key": self._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
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

    async def fetch_tornstats_spy(self, faction_id: int, ts_key: str) -> dict[int, "PersonalStats"]:
        from app.models import PersonalStats
        cache_key = f"tspy_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached
        resp = await self._http.get(
            f"https://www.tornstats.com/api/v2/{ts_key}/spy/faction/{faction_id}",
        )
        resp.raise_for_status()
        raw = await _json(resp)
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
