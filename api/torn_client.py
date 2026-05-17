from __future__ import annotations

import inspect
import time
from typing import Any

import httpx

from api.models import FactionMember, WarStatus, MemberBars, PersonalStats


V1_BASE = "https://api.torn.com"  # v1 is frozen by Torn but functional — we use it for selections whose v2 shape breaks our consumers (most user/*, torn/stocks, torn/items, torn/honors, torn/rankedwars, personalstats, company director). v1→v2 migration tracked as backlog.
V2_BASE = "https://api.torn.com/v2"
YATA_BASE = "https://yata.yt/api/v1"
YATA_CACHE_TTL = 3600


class TornStatsAuthError(Exception):
    """TornStats rejected the API key (401/403). Distinct from "no data" (200 + status:false) so callers can mark the key invalid and try the next one in the pool."""


async def _json(resp: Any) -> Any:
    """Call resp.json() — handles both sync (real httpx) and async (mocks)."""
    result = resp.json()
    if inspect.isawaitable(result):
        return await result
    return result


def _num(v: Any) -> float:
    """Coerce v to float, defaulting to 0.0 if non-numeric.

    TornStats and YATA occasionally return non-numeric placeholders for spy
    fields — e.g. the literal string "N/A" when no actual spy exists, only a
    level-based total estimate. SQLite's dynamic typing happily stores those
    strings in REAL columns, where they later round-trip back to JSON and the
    browser renders `Math.round("N/A")` → NaN. Coerce at the parser boundary
    so non-numeric values can never enter the DB.
    """
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# Torn rank ladder (wiki: https://wiki.torn.com/wiki/Rank). v1 `user/?selections=profile`
# returns a single concatenated string like ``"Invincible Damage Dealer"`` — tier + title
# fused together. v2 returns them as separate fields. We parse v1's string by
# greedy-matching the longest known tier prefix; multi-word tiers come first.
#
# Used by ``extract_rank_tier`` to feed ``api.stat_estimator.estimate_stats(rank=...)``
# without adding a v2 fetch (per docs/torn-api-v2-migration.md, v2 user/profile is
# nested and would break the rest of our consumers).
_RANK_TIERS_LONGEST_FIRST: tuple[str, ...] = (
    "Absolute beginner",
    "Highly distinguished",
    "Highly competent",
    "Above average",
    "Below average",
    "Highly Respected",
    # Single-word tiers, in ladder order (descending in difficulty/prestige)
    "Invincible",
    "Legendary",
    "Heroic",
    "Champion",
    "Idolised",
    "Idolized",
    "Supreme",
    "Celebrity",
    "Outstanding",
    "Master",
    "Star",
    "Professional",
    "Distinguished",
    "Veteran",
    "Elite",  # NOTE: "Elite" placed late on purpose — does not conflict with longer prefixes
    "Competent",
    "Reasonable",
    "Average",
    "Novice",
    "Rookie",
    "Inexperienced",
    "Beginner",
)


def extract_rank_tier(profile: dict | None) -> str | None:
    """Return the rank tier string (e.g. ``"Invincible"``) from a v1 profile dict.

    The v1 ``user/?selections=profile`` endpoint returns ``rank`` as a single
    concatenated string ``"<tier> <title>"`` — e.g. ``"Invincible Damage Dealer"``.
    We split on the longest known tier prefix.

    Returns:
        The tier string (always one of the canonical Torn rank names), or
        ``None`` when *profile* is empty, missing the ``rank`` field, or the
        rank string starts with an unrecognized prefix.

    Examples:
        >>> extract_rank_tier({"rank": "Invincible Damage Dealer"})
        'Invincible'
        >>> extract_rank_tier({"rank": "Legendary Outcast"})
        'Legendary'
        >>> extract_rank_tier({"rank": "Highly Respected Tank"})
        'Highly Respected'
        >>> extract_rank_tier({"rank": ""}) is None
        True
        >>> extract_rank_tier({}) is None
        True
    """
    if not profile or not isinstance(profile, dict):
        return None
    raw = profile.get("rank")
    if not raw or not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    for tier in _RANK_TIERS_LONGEST_FIRST:
        # Exact match (no title) or tier-prefix followed by space + title
        if text == tier or text.startswith(tier + " "):
            return tier
    return None


class TornClient:
    def __init__(self, api_key: str, cache_ttl: int = 60, analytics_store=None) -> None:
        self._api_key = api_key
        self._cache_ttl = cache_ttl
        self._http = httpx.AsyncClient(timeout=15.0, headers={"User-Agent": "TM-Hub/1.0"})
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

    def _resolve_api_key(self, api_key: str | None = None) -> str:
        return api_key or self._api_key

    def _cache_scope(self, api_key: str | None = None) -> str:
        resolved = self._resolve_api_key(api_key)
        return "default" if resolved == self._api_key else resolved[:8]

    async def fetch_members(self, api_key: str | None = None) -> list[FactionMember]:
        cache_key = f"members:{self._cache_scope(api_key)}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        start = time.time()
        api_key_value = self._resolve_api_key(api_key)
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/members",
                params={"key": api_key_value},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/members", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/members", False, (time.time() - start) * 1000, str(e))
            raise
        # Torn occasionally returns 200 with a payload missing the `members` key (transient
        # hiccup or `{error: ...}` body). Treat as empty rather than 500ing /api/overview.
        # Real HTTP/JSON failures already raise above.
        raw_members = raw.get("members") if isinstance(raw, dict) else None
        if not isinstance(raw_members, list):
            self._log_integration(
                "torn_api", "/v2/faction/members", False, (time.time() - start) * 1000,
                f"malformed response: members={type(raw_members).__name__}",
            )
            self._set_cached(cache_key, [])
            return []
        members = [FactionMember(**m) for m in raw_members]
        self._set_cached(cache_key, members)
        return members

    async def fetch_war(self, api_key: str | None = None) -> WarStatus | None:
        cache_key = f"war:{self._cache_scope(api_key)}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        start = time.time()
        api_key_value = self._resolve_api_key(api_key)
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/",
                params={"selections": "wars", "key": api_key_value},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/wars", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/wars", False, (time.time() - start) * 1000, str(e))
            raise
        ranked = raw.get("wars", {}).get("ranked")
        if not ranked:
            self._set_cached(cache_key, None)
            return None

        war = WarStatus(**ranked)
        # War is over if there's a winner or end time has passed
        if war.winner or (war.end and war.end <= int(time.time())):
            self._set_cached(cache_key, None)
            return None

        self._set_cached(cache_key, war)
        return war

    async def fetch_chain(self, api_key: str | None = None) -> dict:
        cache_key = f"chain:{self._cache_scope(api_key)}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        start = time.time()
        api_key_value = self._resolve_api_key(api_key)
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/",
                params={"selections": "chain", "key": api_key_value},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/chain", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/chain", False, (time.time() - start) * 1000, str(e))
            raise
        chain = raw.get("chain", {})
        self._set_cached(cache_key, chain)
        return chain

    async def fetch_member_bars(self, member_key: str) -> MemberBars:
        start = time.time()
        try:
            # NB: v2 nests these under a "bars" key (v1 had top-level energy/nerve/happy/life).
            # Staying on v1 until consumers read the nested shape.
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
            return cached if cached != "_yata_down" else None
        # Negative cache: don't hammer YATA if it just failed
        if self._get_cached("yata_down", ttl=60) is not None:
            return None
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
                self._set_cached("yata_down", True)
                return None
            self._log_integration("yata", "/api/v1/faction/members/", True, (time.time() - start) * 1000)
            members = data.get("members", data)  # YATA wraps members under "members" key
            self._set_cached("yata_members", members)
            return members
        except Exception as e:
            self._log_integration("yata", "/api/v1/faction/members/", False, (time.time() - start) * 1000, str(e))
            self._set_cached("yata_down", True)
            return None

    async def fetch_yata_travel_stocks(self) -> dict | None:
        """Fetch current foreign item stocks & prices from YATA travel export."""
        cached = self._get_cached("yata_travel", ttl=900)  # 15 min cache
        if cached is not None:
            return cached if cached != "_yata_down" else None
        start = time.time()
        try:
            resp = await self._http.get(
                f"{YATA_BASE}/travel/export/",
                timeout=10.0,
            )
            resp.raise_for_status()
            data = await _json(resp)
            self._log_integration("yata", "/api/v1/travel/export/", True, (time.time() - start) * 1000)
            self._set_cached("yata_travel", data)
            return data
        except Exception as e:
            self._log_integration("yata", "/api/v1/travel/export/", False, (time.time() - start) * 1000, str(e))
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
        # Same defensive shape as fetch_members — Torn v2 occasionally returns
        # 200 with a payload missing the `members` key. Don't 500 /api/enemy.
        raw_members = raw.get("members") if isinstance(raw, dict) else None
        if not isinstance(raw_members, list):
            self._log_integration(
                "torn_api", f"/v2/faction/{faction_id}/members", False, (time.time() - start) * 1000,
                f"malformed response: members={type(raw_members).__name__}",
            )
            self._set_cached(cache_key, [])
            return []
        members = [FactionMember(**m) for m in raw_members]
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

    async def fetch_user_basic(self, player_id: int) -> dict | None:
        """Fetch a single player's basic profile + status + last_action + faction.

        Used by the chat entity-card resolver. Keep this fast/cheap — one call
        per player ID, cached 60s.

        NB: v1 ``/user/?id=NNN`` is silently ignored by Torn and returns the
        key owner's data (caused the 2026-05-16 "everyone shows 7B" outage).
        We use **path form** ``/v1/user/<id>/`` which works correctly.
        """
        cache_key = f"user_basic_{player_id}"
        cached = self._get_cached(cache_key, ttl=60)
        if cached is not None:
            return cached
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V1_BASE}/user/{player_id}/",
                params={"selections": "profile", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            if isinstance(raw, dict) and raw.get("error"):
                self._log_integration(
                    "torn_api", f"/v1/user/{player_id}/profile", False,
                    (time.time() - start) * 1000, str(raw["error"]),
                )
                return None
            self._log_integration(
                "torn_api", f"/v1/user/{player_id}/profile", True,
                (time.time() - start) * 1000,
            )
        except Exception as e:
            self._log_integration(
                "torn_api", f"/v1/user/{player_id}/profile", False,
                (time.time() - start) * 1000, str(e),
            )
            return None
        # Trim to the shape the resolver expects — keep payload small.
        status = raw.get("status") if isinstance(raw.get("status"), dict) else {}
        last_action = raw.get("last_action") if isinstance(raw.get("last_action"), dict) else {}
        faction = raw.get("faction") if isinstance(raw.get("faction"), dict) else {}
        result = {
            "name": raw.get("name", ""),
            "level": raw.get("level", 0),
            "status": {
                "state": status.get("state", ""),
                "description": status.get("description", ""),
                "until": status.get("until", 0),
            },
            "last_action": {
                "relative": last_action.get("relative", ""),
                "timestamp": last_action.get("timestamp", 0),
            },
            "faction": {
                "faction_id": faction.get("faction_id", 0),
                "faction_tag": faction.get("faction_tag", ""),
                "faction_name": faction.get("faction_name", ""),
                "position": faction.get("position", ""),
            },
        }
        self._set_cached(cache_key, result)
        return result

    async def fetch_user_profile_stats(self, player_id: int) -> dict | None:
        """Fetch a player's personalstats + profile by ID (using faction key).

        NB: v1 ``/user/?id=NNN`` is silently ignored by Torn — the response
        carries the API key OWNER's data, not the target's. We hit the **path
        form** ``/v1/user/<id>/`` which is the only working way to look up an
        arbitrary player by ID. Same bug-class as the 2026-05-16 "everyone
        shows 7B" outage; see ``api/routers/spy.py`` and
        ``reference_torn_api_user_id_path.md`` in agent memory.

        Returns the raw v1 fields the caller needs PLUS a ``rank`` string
        (concatenated tier+title, e.g. ``"Invincible Damage Dealer"``).
        Callers that need the tier alone should use
        :func:`api.torn_client.extract_rank_tier`.
        """
        cache_key = f"user_profile_{player_id}"
        cached = self._get_cached(cache_key, ttl=300)
        if cached is not None:
            return cached
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V1_BASE}/user/{player_id}/",
                params={"selections": "personalstats,profile", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", f"/v1/user/{player_id}/profile+ps", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", f"/v1/user/{player_id}/profile+ps", False, (time.time() - start) * 1000, str(e))
            return None
        status = raw.get("status", {})
        result = {
            "personalstats": raw.get("personalstats", {}),
            "level": raw.get("level", 0),
            "age": raw.get("age", 0),
            "name": raw.get("name", ""),
            "rank": raw.get("rank", "") or "",
            "status_state": status.get("state", "") if isinstance(status, dict) else str(status),
            "status_until": status.get("until", 0) if isinstance(status, dict) else 0,
            "last_action": raw.get("last_action", {}).get("relative", "") if isinstance(raw.get("last_action"), dict) else "",
        }
        self._set_cached(cache_key, result)
        return result

    async def fetch_training_data(self, api_key: str) -> dict | None:
        """Fetch user's training-related data from Torn API."""
        cache_key = f"training:{self._cache_scope(api_key)}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

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

        # Parse steadfast bonuses from faction_perks (e.g. "Gym gains for strength +5%")
        steadfast = {"strength": 0, "defense": 0, "speed": 0, "dexterity": 0}
        for perk in raw.get("faction_perks", []):
            p = perk.lower()
            if "gym gains" in p or "steadfast" in p:
                import re
                match = re.search(r'(\d+)%', perk)
                pct = int(match.group(1)) if match else 0
                for stat in ("strength", "defense", "speed", "dexterity"):
                    if stat in p:
                        steadfast[stat] = pct
                        break
                else:
                    # Generic "all gym gains" perk
                    if "all" in p or not any(s in p for s in ("strength", "defense", "speed", "dexterity")):
                        for stat in steadfast:
                            steadfast[stat] = max(steadfast[stat], pct)

        result = {
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
                "gymstrength": ps.get("gymstrength", 0),
                "gymdefense": ps.get("gymdefense", 0),
                "gymspeed": ps.get("gymspeed", 0),
                "gymdexterity": ps.get("gymdexterity", 0),
            },
            "steadfast": steadfast,
            "educationCompleted": education_completed,
            "educationPerks": raw.get("education_perks", []),
            "bookPerks": raw.get("book_perks", []),
            "companyPerks": raw.get("company_perks", []),
            "job": {
                "company_id": raw.get("job", {}).get("company_id") or raw.get("company", {}).get("company_id", 0),
                "company_name": raw.get("job", {}).get("company_name") or raw.get("company", {}).get("name", ""),
                "company_type": raw.get("job", {}).get("company_type") or raw.get("company", {}).get("company_type", 0),
                "position": raw.get("job", {}).get("position", ""),
            },
            "level": raw.get("level", 0),
        }
        self._set_cached(cache_key, result)
        return result

    async def fetch_bounties(self) -> list[dict]:
        """Fetch available bounties from Torn global bounty list."""
        cached = self._get_cached("bounties", ttl=60)
        if cached is not None:
            return cached
        start = time.time()
        try:
            # Try v2 endpoint first
            resp = await self._http.get(
                f"{V2_BASE}/torn",
                params={"selections": "bounties", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/torn/bounties", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/torn/bounties", False, (time.time() - start) * 1000, str(e))
            raise
        bounties = raw.get("bounties", [])
        if isinstance(bounties, dict):
            result = list(bounties.values())
        elif isinstance(bounties, list):
            result = bounties
        else:
            result = []
        self._set_cached("bounties", result)
        return result

    async def fetch_ranked_wars(self) -> list[dict]:
        """Fetch past ranked war summaries."""
        cached = self._get_cached("ranked_wars", ttl=300)
        if cached is not None:
            return cached
        start = time.time()
        try:
            # NB: v2 returns {"error": ...} for rankedwars — keep on v1 (frozen but functional).
            resp = await self._http.get(
                f"{V1_BASE}/torn/",
                params={"selections": "rankedwars", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/torn/rankedwars", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/torn/rankedwars", False, (time.time() - start) * 1000, str(e))
            raise
        wars = raw.get("rankedwars", {})
        if isinstance(wars, dict):
            result = list(wars.values())
        elif isinstance(wars, list):
            result = wars
        else:
            result = []
        self._set_cached("ranked_wars", result)
        return result

    async def fetch_war_history(self) -> dict:
        """Fetch full war data including history."""
        cached = self._get_cached("war_history", ttl=120)
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
            self._log_integration("torn_api", "/v2/faction/wars_full", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/wars_full", False, (time.time() - start) * 1000, str(e))
            raise
        wars = raw.get("wars", {})
        self._set_cached("war_history", wars)
        return wars

    async def fetch_faction_crimes(self, cat: str = "planning") -> list[dict]:
        """Fetch faction organized crimes. cat: planning, completed, executing."""
        cache_key = f"oc_{cat}"
        cached = self._get_cached(cache_key, ttl=60)
        if cached is not None:
            return cached
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/crimes",
                params={"cat": cat, "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", f"/v2/faction/crimes?cat={cat}", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", f"/v2/faction/crimes?cat={cat}", False, (time.time() - start) * 1000, str(e))
            raise
        crimes = raw.get("crimes", [])
        if isinstance(crimes, dict):
            crimes = list(crimes.values())
        self._set_cached(cache_key, crimes)
        return crimes

    async def fetch_stock_market(self) -> dict:
        """Fetch all stock listings from Torn."""
        cached = self._get_cached("stocks_market", ttl=300)
        if cached is not None:
            return cached
        start = time.time()
        try:
            # NB: v2 returns stocks as a LIST (v1 as a dict keyed by id) — our consumers
            # iterate stocks.items(), so stay on v1 until we update those callers.
            resp = await self._http.get(
                f"{V1_BASE}/torn/",
                params={"selections": "stocks", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/torn/stocks", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/torn/stocks", False, (time.time() - start) * 1000, str(e))
            raise
        stocks = raw.get("stocks", {})
        self._set_cached("stocks_market", stocks)
        return stocks

    async def fetch_user_stocks(self, api_key: str) -> dict:
        """Fetch player's stock portfolio."""
        cache_key = f"stocks_{api_key[:8]}"
        cached = self._get_cached(cache_key, ttl=120)
        if cached is not None:
            return cached
        start = time.time()
        try:
            # NB: v2 returns user stocks as a LIST with shape {id, shares, transactions[]} —
            # v1 is a dict keyed by stock_id with {total_shares, dividend, transactions{}}.
            # Our portfolio router reads the v1 shape, so stay on v1 here.
            resp = await self._http.get(
                f"{V1_BASE}/user/",
                params={"selections": "stocks", "key": api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/user/stocks", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/user/stocks", False, (time.time() - start) * 1000, str(e))
            raise
        stocks = raw.get("stocks", {})
        self._set_cached(cache_key, stocks)
        return stocks

    async def fetch_faction_revives(self) -> list[dict]:
        """Fetch recent faction revives (up to 990)."""
        cached = self._get_cached("revives", ttl=60)
        if cached is not None:
            return cached
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/faction/",
                params={"selections": "revives", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/faction/revives", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/revives", False, (time.time() - start) * 1000, str(e))
            raise
        revives = raw.get("revives", [])
        if isinstance(revives, dict):
            revives = list(revives.values())
        self._set_cached("revives", revives)
        return revives

    async def fetch_user_honors(self, api_key: str) -> dict:
        """Fetch user's awarded honors and medals."""
        cache_key = f"honors_{api_key[:8]}"
        cached = self._get_cached(cache_key, ttl=300)
        if cached is not None:
            return cached
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V1_BASE}/user/",
                params={"selections": "honors,medals,personalstats,profile", "key": api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/user/honors", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/user/honors", False, (time.time() - start) * 1000, str(e))
            raise
        result = {
            "honors_awarded": raw.get("honors_awarded", []),
            "honors_time": raw.get("honors_time", []),
            "medals_awarded": raw.get("medals_awarded", []),
            "medals_time": raw.get("medals_time", []),
            "player_id": raw.get("player_id"),
            "name": raw.get("name"),
        }
        self._set_cached(cache_key, result)
        return result

    async def fetch_honor_catalog(self) -> dict:
        """Fetch all available honors and medals definitions."""
        cached = self._get_cached("honor_catalog", ttl=3600)
        if cached is not None:
            return cached
        start = time.time()
        try:
            # NB: v2 returns honors/medals as LISTS (v1 as dicts keyed by id) — collect_circulation
            # iterates honors.items() / medals.items(), so stay on v1 until we update consumers.
            resp = await self._http.get(
                f"{V1_BASE}/torn/",
                params={"selections": "honors,medals", "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v1/torn/honors", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v1/torn/honors", False, (time.time() - start) * 1000, str(e))
            raise

        # Defensive: v1 *should* return honors/medals as dicts keyed by id, but we've seen
        # AttributeError: 'list' object has no attribute 'items' in production (collect_circulation
        # iterates .items()). If Torn ever drifts to a list shape — or leaks an error payload
        # with a wrong type — normalize to the dict-keyed-by-id contract callers expect.
        def _as_id_dict(raw_val: Any) -> dict:
            if isinstance(raw_val, dict):
                return raw_val
            if isinstance(raw_val, list):
                out: dict = {}
                for i, item in enumerate(raw_val):
                    if not isinstance(item, dict):
                        continue
                    item_id = item.get("id", i)
                    out[str(item_id)] = item
                return out
            return {}

        result = {
            "honors": _as_id_dict(raw.get("honors")),
            "medals": _as_id_dict(raw.get("medals")),
        }
        self._set_cached("honor_catalog", result)
        return result

    async def fetch_item_stats(self, item_id: int) -> dict | None:
        """Fetch v2 torn/itemstats for a single item: circulation + market value history.
        Returns None on error. Useful for spotting deflation/inflation in tradeable items.
        """
        cache_key = f"itemstats_{item_id}"
        cached = self._get_cached(cache_key, ttl=900)  # 15 min — circulation/value change slowly
        if cached is not None:
            return cached
        t0 = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/torn/itemstats",
                params={"id": item_id, "key": self._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/torn/itemstats", True, (time.time() - t0) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/torn/itemstats", False, (time.time() - t0) * 1000, str(e))
            return None
        stats = raw.get("itemstats") if isinstance(raw, dict) else None
        if not stats:
            return None
        self._set_cached(cache_key, stats)
        return stats

    async def fetch_company_catalog(self) -> dict:
        """Fetch all company type definitions with specials, positions, stock."""
        cached = self._get_cached("company_catalog", ttl=3600)
        if cached is not None:
            return cached
        t0 = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/torn/",
                params={"selections": "companies", "key": self._api_key},
            )
            resp.raise_for_status()
            data = await _json(resp)
            companies = data.get("companies", {})
            self._set_cached("company_catalog", companies)
            self._log_integration("torn", "v2/torn/companies", True, (time.time() - t0) * 1000)
            return companies
        except Exception as e:
            self._log_integration("torn", "v2/torn/companies", False, (time.time() - t0) * 1000, str(e))
            raise

    async def _fetch_company_selection(
        self,
        selection: str,
        api_key: str,
        *,
        company_id: int | None = None,
        extra_params: dict[str, Any] | None = None,
        cache_ttl: int = 60,
    ) -> dict | None:
        """Fetch a /company/[id]?selections=... endpoint. Returns None on access-error (code 7)."""
        path = f"/company/{company_id}" if company_id else "/company/"
        scope = self._cache_scope(api_key) if company_id is None else f"id{company_id}"
        cache_key = f"company_{selection}:{scope}"
        if extra_params:
            cache_key += ":" + ":".join(f"{k}={v}" for k, v in sorted(extra_params.items()))
        cached = self._get_cached(cache_key, ttl=cache_ttl)
        if cached is not None:
            return cached
        params: dict[str, Any] = {"selections": selection, "key": api_key}
        if extra_params:
            params.update(extra_params)
        t0 = time.time()
        endpoint = f"{path}?selections={selection}"
        try:
            resp = await self._http.get(f"{V1_BASE}{path}", params=params)
            resp.raise_for_status()
            raw = await _json(resp)
            if isinstance(raw, dict) and raw.get("error"):
                err = raw["error"]
                code = err.get("code") if isinstance(err, dict) else None
                self._log_integration("torn_api", endpoint, False, (time.time() - t0) * 1000, str(err))
                if code in (7, 2):
                    # 7 = access level too low; 2 = incorrect key (no director rights)
                    self._set_cached(cache_key, None)
                    return None
                return None
            self._set_cached(cache_key, raw)
            self._log_integration("torn_api", endpoint, True, (time.time() - t0) * 1000)
            return raw
        except Exception as e:
            self._log_integration("torn_api", endpoint, False, (time.time() - t0) * 1000, str(e))
            return None

    async def fetch_company_detailed(self, api_key: str | None = None) -> dict | None:
        """Director-only: financials + operational metrics + upgrades. None if not director."""
        return await self._fetch_company_selection("detailed", self._resolve_api_key(api_key))

    async def fetch_company_employees(self, api_key: str | None = None) -> dict | None:
        """Director-only: per-employee effectiveness, wage, stats. None if not director."""
        return await self._fetch_company_selection("employees", self._resolve_api_key(api_key))

    async def fetch_company_applications(self, api_key: str | None = None) -> dict | None:
        """Director-only: pending job applications with stats + message. None if not director."""
        return await self._fetch_company_selection("applications", self._resolve_api_key(api_key))

    async def fetch_company_stock(self, api_key: str | None = None) -> dict | None:
        """Director-only: current stock levels + sales. None if not director."""
        return await self._fetch_company_selection("stock", self._resolve_api_key(api_key))

    async def fetch_company_news(
        self,
        api_key: str | None = None,
        *,
        from_ts: int | None = None,
        to_ts: int | None = None,
        limit: int | None = None,
    ) -> dict | None:
        """Director-only: company news events. None if not director."""
        extra: dict[str, Any] = {}
        if from_ts is not None:
            extra["from"] = from_ts
        if to_ts is not None:
            extra["to"] = to_ts
        if limit is not None:
            extra["limit"] = limit
        return await self._fetch_company_selection(
            "news", self._resolve_api_key(api_key), extra_params=extra or None
        )

    async def fetch_company_profile(self, company_id: int, api_key: str | None = None) -> dict | None:
        """Public: company profile by id. Returns None on error."""
        return await self._fetch_company_selection(
            "profile",
            self._resolve_api_key(api_key),
            company_id=company_id,
            cache_ttl=300,
        )

    async def fetch_key_info(self, api_key: str) -> dict | None:
        """Fetch v2 /key/info — access level + which selections this key unlocks.
        Returns None on error. Result shape:
        {
          "access_level": int,  # 0=public, 1=minimal, 2=limited, 3=full, 4=paid (premium)
          "access_type": str,   # human label e.g. "Full Access"
          "selections": {section: [selection_name, ...]},  # what each section unlocks
        }
        """
        cache_key = f"key_info_{api_key[:8]}"
        cached = self._get_cached(cache_key, ttl=3600)
        if cached is not None:
            return cached
        start = time.time()
        try:
            resp = await self._http.get(
                f"{V2_BASE}/key/info",
                params={"key": api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("torn_api", "/v2/key/info", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/key/info", False, (time.time() - start) * 1000, str(e))
            return None
        if not isinstance(raw, dict):
            return None
        # v2 /key/info wraps payload under "info"; "access"+"selections" live there.
        # We also accept a flat shape in case Torn ever inlines it.
        info = raw.get("info") if isinstance(raw.get("info"), dict) else raw
        access = info.get("access") if isinstance(info.get("access"), dict) else {}
        selections = info.get("selections") if isinstance(info.get("selections"), dict) else {}
        if not access and not selections:
            return None
        result = {
            "access_level": access.get("level", access.get("access_level", 0)),
            "access_type": access.get("type") or access.get("access_type") or "Unknown",
            "selections": selections,
        }
        self._set_cached(cache_key, result)
        return result

    async def fetch_tornstats_efficiency(
        self, ts_key: str, *, manual_labor: int, intelligence: int, endurance: int
    ) -> dict | None:
        """TornStats: predicted employee efficiency per company position for given work stats.
        Returns raw response dict or None on error/disabled key."""
        cache_key = f"ts_efficiency_{manual_labor}_{intelligence}_{endurance}"
        cached = self._get_cached(cache_key, ttl=3600)
        if cached is not None:
            return cached
        t0 = time.time()
        try:
            resp = await self._http.get(
                f"https://www.tornstats.com/api/v2/{ts_key}/efficiency",
                params={"man": manual_labor, "int": intelligence, "end": endurance},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("tornstats", "/api/v2/efficiency", True, (time.time() - t0) * 1000)
        except Exception as e:
            self._log_integration("tornstats", "/api/v2/efficiency", False, (time.time() - t0) * 1000, str(e))
            return None
        if not raw.get("status", True):
            self._set_cached(cache_key, None)
            return None
        self._set_cached(cache_key, raw)
        return raw

    async def fetch_faction_news(
        self,
        category: str,
        *,
        from_ts: int | None = None,
        to_ts: int | None = None,
        limit: int = 100,
        sort: str = "DESC",
        api_key: str | None = None,
    ) -> list[dict]:
        """Generic faction/news fetcher with pagination. Categories include:
        armoryDeposit, armorynewsfull, attack, chain, cesium, depositFunds,
        withdraw, revive, crime, depositArmor, retract — see Torn API v2 docs.
        Returns list of {id, timestamp, text, ...} entries newest-first by default.
        """
        api_key_value = self._resolve_api_key(api_key)
        all_entries: list[dict] = []
        url = f"{V2_BASE}/faction/news"
        params: dict[str, Any] = {
            "cat": category,
            "sort": sort,
            "limit": limit,
            "key": api_key_value,
        }
        if from_ts is not None:
            params["from"] = from_ts
        if to_ts is not None:
            params["to"] = to_ts
        start = time.time()
        try:
            # One page only (caller can re-call with from/to if they want pagination)
            resp = await self._http.get(url, params=params)
            resp.raise_for_status()
            raw = await _json(resp)
            entries = raw.get("news", [])
            all_entries.extend(entries)
            self._log_integration("torn_api", f"/v2/faction/news?cat={category}", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", f"/v2/faction/news?cat={category}", False, (time.time() - start) * 1000, str(e))
            raise
        return all_entries

    async def fetch_armoury_deposits(self, from_ts: int, to_ts: int, api_key: str | None = None) -> list[dict]:
        api_key_value = self._resolve_api_key(api_key)
        all_entries: list[dict] = []
        url = f"{V2_BASE}/faction/news"
        params: dict[str, Any] = {
            "cat": "armoryDeposit",
            "from": from_ts,
            "to": to_ts,
            "sort": "ASC",
            "limit": 100,
            "key": api_key_value,
        }
        start = time.time()
        try:
            while True:
                resp = await self._http.get(url, params=params)
                resp.raise_for_status()
                raw = await _json(resp)
                entries = raw.get("news", [])
                all_entries.extend(entries)
                metadata = raw.get("_metadata", {})
                next_params = metadata.get("next")
                if not next_params or not entries:
                    break
                if isinstance(next_params, dict):
                    params.update(next_params)
                else:
                    break
            self._log_integration("torn_api", "/v2/faction/news?cat=armoryDeposit", True, (time.time() - start) * 1000)
        except Exception as e:
            self._log_integration("torn_api", "/v2/faction/news?cat=armoryDeposit", False, (time.time() - start) * 1000, str(e))
            raise
        return all_entries

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

    async def fetch_tornstats_faction_battle_stats(
        self, faction_id: int, ts_key: str
    ) -> dict[int, dict]:
        """Battle stats per member from TornStats faction spy endpoint.

        TornStats `/spy/faction/{id}` returns each member with both
        ``personalstats`` (xanax/attacks/networth/...) and ``spy`` (strength/
        defense/speed/dexterity/total). This method extracts the ``spy`` block
        — the battle stats — for use by ``refresh_spy_cache`` (which writes
        them into ``spy_reports`` for threat scoring).

        Returns dict[player_id, {strength, defense, speed, dexterity, total, timestamp}].
        Players without a ``spy`` block (no spy data available) are skipped.
        """
        cache_key = f"tspy_battle_{faction_id}"
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

        result: dict[int, dict] = {}
        if not raw.get("status"):
            self._set_cached(cache_key, result)
            return result
        members_data = raw.get("faction", {}).get("members", {})
        for pid_str, member_data in members_data.items():
            spy_raw = member_data.get("spy") or {}
            if not spy_raw:
                continue
            result[int(pid_str)] = {
                # member_data.name is the TornStats-level player name; spy block has no name.
                # Without this, scheduler upserts player_name=None and the UI shows "Unknown player".
                "name": member_data.get("name") or spy_raw.get("player_name"),
                "strength": _num(spy_raw.get("strength")),
                "defense": _num(spy_raw.get("defense")),
                "speed": _num(spy_raw.get("speed")),
                "dexterity": _num(spy_raw.get("dexterity")),
                "total": _num(spy_raw.get("total")),
                "timestamp": spy_raw.get("timestamp"),
            }
        self._set_cached(cache_key, result)
        return result

    async def fetch_tornstats_spy_user(self, player_id: int, ts_key: str) -> dict | None:
        """Fetch estimated battle stats for a single player from TornStats.

        Returns dict with strength/defense/speed/dexterity/total, or None
        when TornStats has no spy for this player. Raises TornStatsAuthError
        on 401/403 so the caller (router) can mark the key invalid in the DB
        and try the next one in the per-user pool.

        Cache is per-(player_id, key prefix) so a bad key's empty result
        doesn't poison a good key's lookup for the same XID.
        """
        cache_key = f"tspy_user_{player_id}_{ts_key[:8] if ts_key else 'none'}"
        cached = self._get_cached(cache_key, ttl=300)
        if cached is not None:
            return cached

        start = time.time()
        try:
            resp = await self._http.get(
                f"https://www.tornstats.com/api/v2/{ts_key}/spy/user/{player_id}",
            )
            if resp.status_code in (401, 403):
                self._log_integration("tornstats", f"/api/v2/spy/user/{player_id}", False, (time.time() - start) * 1000, f"HTTP {resp.status_code}")
                raise TornStatsAuthError(f"TornStats rejected key (HTTP {resp.status_code})")
            resp.raise_for_status()
            raw = await _json(resp)
            self._log_integration("tornstats", f"/api/v2/spy/user/{player_id}", True, (time.time() - start) * 1000)
        except TornStatsAuthError:
            raise
        except Exception as e:
            self._log_integration("tornstats", f"/api/v2/spy/user/{player_id}", False, (time.time() - start) * 1000, str(e))
            return None

        if not raw.get("status") or not raw.get("spy"):
            self._set_cached(cache_key, None)
            return None

        spy = raw["spy"]
        result = {
            "player_id": player_id,
            "player_name": spy.get("player_name") or spy.get("name"),
            "strength": _num(spy.get("strength")),
            "defense": _num(spy.get("defense")),
            "speed": _num(spy.get("speed")),
            "dexterity": _num(spy.get("dexterity")),
            "total": _num(spy.get("total")),
            "timestamp": spy.get("timestamp"),
        }
        self._set_cached(cache_key, result)
        return result

    async def fetch_yata_spy_user(self, player_id: int, api_key: str | None = None) -> dict | None:
        """Fetch estimated battle stats for a single player from YATA.

        YATA's spy network is independent of TornStats — adding it as a second
        source closes the gap where TornStats has a stale spy (e.g. from a year
        ago, before the player grew) while YATA has a recent one.

        Endpoint: ``/api/v1/spy/{player_id}/?key={api_key}``.
        Response shape (per YATA docs https://yata.yt/api/) is flat, keyed by
        target_id at the top level:
        ``{"<target_id>": {strength, defense, speed, dexterity, total,
        *_timestamp, update, target_name, target_faction_id, ...}}``.

        Returns dict with strength/defense/speed/dexterity/total/timestamp
        (epoch int from YATA's ``update`` field — the most recent of the per-stat
        timestamps) plus ``player_name``. None on error, empty response, or when
        YATA reports a semantic error (e.g. 400 "Player not found" — meaning the
        target isn't in any spy DB our faction can see, NOT that YATA is down).

        Two failure modes are distinguished:

        - **Transport error** (timeout, DNS, 5xx): sets the global ``yata_down``
          cache for 60s so we don't hammer YATA while it's struggling.
        - **Semantic error** (4xx with JSON ``{"error": {...}}`` body): logs the
          error message for diagnostics, caches None for this player only.
          Doing this for the global cache would block all YATA spy calls every
          time the queried player happens not to be in YATA's DB — burning the
          integration for everyone for 60s on every miss.

        Successful results cached for 1 hour (matches YATA's own cache so we
        don't waste their bandwidth).
        """
        cache_key = f"yspy_user_{player_id}"
        cached = self._get_cached(cache_key, ttl=YATA_CACHE_TTL)
        if cached is not None:
            return cached if cached != "_yata_down" else None
        if self._get_cached("yata_down", ttl=60) is not None:
            return None

        key = api_key or self._api_key
        endpoint = f"/api/v1/spy/{player_id}"
        start = time.time()
        try:
            resp = await self._http.get(
                f"{YATA_BASE}/spy/{player_id}/",
                params={"key": key},
                timeout=8.0,
            )
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            self._log_integration("yata", endpoint, False, elapsed, str(e))
            self._set_cached("yata_down", True)
            return None

        elapsed = (time.time() - start) * 1000
        raw, _err = await self._yata_parse_body(resp, endpoint, cache_key, elapsed)
        if raw is None:
            return None

        # Documented shape: {"<target_id>": {...}} at the top level. No envelope.
        spy = raw.get(str(player_id)) or raw.get(player_id) if isinstance(raw, dict) else None
        if not spy:
            self._set_cached(cache_key, None)
            return None

        self._log_integration("yata", endpoint, True, elapsed)
        result = {
            "player_id": player_id,
            "player_name": spy.get("target_name"),
            "strength": _num(spy.get("strength")),
            "defense": _num(spy.get("defense")),
            "speed": _num(spy.get("speed")),
            "dexterity": _num(spy.get("dexterity")),
            "total": _num(spy.get("total")),
            # ``update`` = max of per-stat timestamps — closest thing YATA has to
            # a single "when was this spy taken" answer.
            "timestamp": spy.get("update"),
        }
        self._set_cached(cache_key, result)
        return result

    async def _yata_parse_body(self, resp, endpoint: str, cache_key: str, elapsed_ms: float):
        """Parse a YATA response, distinguishing semantic errors from transport.

        Returns (raw, error_msg). ``raw`` is the parsed JSON dict on success;
        None on any failure (transport, non-JSON body, semantic 4xx error).
        ``error_msg`` is set for diagnostics when raw is None.

        Side effects:
        - Logs to integration analytics.
        - Sets per-cache-key negative entry on semantic errors (NOT the global
          ``yata_down`` — that's reserved for actual outages).
        - Sets ``yata_down`` only on transport-level failures (network, 5xx,
          non-JSON body, missing JSON envelope).
        """
        # Try to read the body regardless of status — YATA returns 400 + JSON
        # for semantic errors ("Player not found", "Player not in any spy DB"),
        # and we want to distinguish that from a real outage.
        raw = None
        body_err = None
        try:
            raw = await _json(resp)
        except Exception as e:
            body_err = f"non-json body: {e}"

        if isinstance(raw, dict) and "error" in raw:
            err = raw["error"]
            msg = (
                f"yata error code={err.get('code')}: {err.get('error')}"
                if isinstance(err, dict)
                else f"yata error: {err}"
            )
            self._log_integration("yata", endpoint, False, elapsed_ms, msg)
            # Per-call cache only — do NOT poison global yata_down. A wrong
            # player_id or a faction with no spy DB is not an outage.
            self._set_cached(cache_key, None)
            return None, msg

        status = getattr(resp, "status_code", None)
        if status is not None and status >= 400:
            msg = body_err or f"HTTP {status}"
            self._log_integration("yata", endpoint, False, elapsed_ms, msg)
            self._set_cached("yata_down", True)
            return None, msg

        if raw is None:
            self._log_integration("yata", endpoint, False, elapsed_ms, body_err or "empty body")
            self._set_cached("yata_down", True)
            return None, body_err

        return raw, None

    async def fetch_yata_faction_spies(self, faction_id: int, api_key: str | None = None) -> dict[int, dict]:
        """Fetch all spies YATA has on a given faction.

        Endpoint: ``/api/v1/spies/?key={key}&faction={faction_id}``.
        Documented response (per YATA docs) is flat — target_id at top level:
        ``{"<id>": {...}, "<id>": {...}}`` — no ``spies`` wrapper.

        Rate-limited by YATA to 1 call/hour, so the result is cached for an hour.

        Returns ``dict[player_id, {strength, defense, speed, dexterity, total,
        timestamp, name}]``. Empty dict on error or no data. Distinguishes
        transport failures (yata_down) from semantic errors via
        :py:meth:`_yata_parse_body` — see that method's docstring for rationale.
        """
        cache_key = f"yspy_faction_{faction_id}"
        cached = self._get_cached(cache_key, ttl=YATA_CACHE_TTL)
        if cached is not None:
            return cached if cached != "_yata_down" else {}
        if self._get_cached("yata_down", ttl=60) is not None:
            return {}

        key = api_key or self._api_key
        endpoint = f"/api/v1/spies/?faction={faction_id}"
        start = time.time()
        try:
            resp = await self._http.get(
                f"{YATA_BASE}/spies/",
                params={"key": key, "faction": faction_id},
                timeout=10.0,
            )
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            self._log_integration("yata", endpoint, False, elapsed, str(e))
            self._set_cached("yata_down", True)
            return {}

        elapsed = (time.time() - start) * 1000
        raw, _err = await self._yata_parse_body(resp, endpoint, cache_key, elapsed)
        if raw is None:
            return {}
        self._log_integration("yata", endpoint, True, elapsed)

        result: dict[int, dict] = {}
        # Documented shape iterates raw.items() directly — no envelope.
        for pid_str, spy in raw.items():
            if not spy:
                continue
            try:
                pid = int(pid_str)
            except (TypeError, ValueError):
                continue
            result[pid] = {
                "name": spy.get("target_name"),
                "strength": _num(spy.get("strength")),
                "defense": _num(spy.get("defense")),
                "speed": _num(spy.get("speed")),
                "dexterity": _num(spy.get("dexterity")),
                "total": _num(spy.get("total")),
                "timestamp": spy.get("update"),
            }
        self._set_cached(cache_key, result)
        return result
