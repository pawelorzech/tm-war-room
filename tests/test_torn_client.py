import time
import pytest
import httpx
from unittest.mock import AsyncMock, patch

from api.torn_client import TornClient


FAKE_MEMBERS_RESPONSE = {
    "members": [
        {
            "id": 123,
            "name": "TestPlayer",
            "level": 50,
            "days_in_faction": 100,
            "last_action": {"status": "Online", "timestamp": 1774600000, "relative": "1 min ago"},
            "status": {"description": "Okay", "details": None, "state": "Okay", "color": "green", "until": None},
            "position": "Team 1",
            "is_on_wall": False,
            "is_revivable": False,
            "is_in_oc": False,
            "has_early_discharge": False,
            "revive_setting": "No one",
        }
    ]
}

FAKE_WARS_RESPONSE = {
    "wars": {
        "ranked": {
            "war_id": 100,
            "start": 1774630800,
            "end": None,
            "target": 500,
            "winner": None,
            "factions": [
                {"id": 1, "name": "Enemy", "score": 5, "chain": 10},
                {"id": 2, "name": "Us", "score": 8, "chain": 15},
            ],
        },
        "raids": [],
        "territory": [],
    },
    "pacts": [],  # NB: v2 returns pacts at top level alongside `wars`, not nested
}

FAKE_BARS_RESPONSE = {
    # v1 user/?selections=bars,cooldowns returns 6 bars at top-level. Migration to v2
    # would nest these under `bars: {...}` — see docs/torn-api-v2-migration.md (line on
    # bars,cooldowns) for the breaking shape.
    "energy": {"current": 500, "maximum": 150, "increment": 5, "interval": 600, "ticktime": 50, "fulltime": 0},
    "happy": {"current": 4000, "maximum": 4525, "increment": 5, "interval": 900, "ticktime": 350, "fulltime": 0},
    "nerve": {"current": 25, "maximum": 100, "increment": 1, "interval": 300, "ticktime": 100, "fulltime": 0},
    "life": {"current": 8800, "maximum": 8800, "increment": 264, "interval": 300, "ticktime": 100, "fulltime": 0},
    "chain": {"current": 0, "maximum": 25000, "timeout": 0, "modifier": 1, "cooldown": 0},
    "cooldowns": {"drug": 3600, "medical": 0, "booster": 0},
    "server_time": 1700000000,
}


@pytest.fixture
def client():
    return TornClient(api_key="fake_key", cache_ttl=5)


@pytest.mark.asyncio
async def test_fetch_members(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_MEMBERS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        members = await client.fetch_members()

    assert len(members) == 1
    assert members[0].name == "TestPlayer"


@pytest.mark.asyncio
async def test_fetch_war(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_WARS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        war = await client.fetch_war()

    assert war is not None
    assert war.war_id == 100
    assert war.factions[1].name == "Us"


@pytest.mark.asyncio
async def test_fetch_war_no_rw(client):
    resp_data = {"wars": {"ranked": None, "raids": [], "territory": []}}
    mock_resp = AsyncMock()
    mock_resp.json.return_value = resp_data
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        war = await client.fetch_war()

    assert war is None


@pytest.mark.asyncio
async def test_fetch_member_bars(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_BARS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        bars = await client.fetch_member_bars("member_key_123")

    assert bars.energy.current == 500
    assert bars.is_stacking is True
    assert bars.cooldowns.drug == 3600


@pytest.mark.asyncio
async def test_caching(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_MEMBERS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        await client.fetch_members()
        await client.fetch_members()

    mock_get.assert_called_once()


FAKE_ENEMY_MEMBERS = {
    "members": [
        {"id": 183527, "name": "DarkMagic", "level": 82, "days_in_faction": 66,
         "last_action": {"status": "Offline", "timestamp": 1774603546, "relative": "13 min ago"},
         "status": {"description": "Okay", "details": None, "state": "Okay", "color": "green", "until": None},
         "position": "Tubby Kitten", "is_on_wall": False, "is_revivable": False, "is_in_oc": False,
         "has_early_discharge": False, "revive_setting": "No one"}
    ]
}

FAKE_FACTION_INFO = {
    "basic": {"id": 9420, "name": "The Pusheen Army", "tag": "TPA", "tag_image": "", "leader_id": 0,
              "co_leader_id": 0, "respect": 4161395, "days_old": 6323, "capacity": 100, "members": 73,
              "is_enlisted": None, "rank": {"level": 16, "name": "Platinum", "division": 2, "position": 0, "wins": 62},
              "best_chain": 50000}
}

FAKE_TORNSTATS_SPY = {
    "status": True,
    "faction": {"members": {"183527": {"name": "DarkMagic", "level": 82, "id": 183527,
        "spy": {"strength": 1_500_000_000, "defense": 1_500_000_000,
                "speed": 1_500_000_000, "dexterity": 1_500_000_000,
                "total": 6_000_000_000, "timestamp": 1778500000},
        "personalstats": {"Xanax Taken": 2002, "Refills": 934, "Stat Enhancers Used": 0,
            "Attacks Won": 4742, "Attacks Lost": 257, "Defends Won": 264, "Defends Lost": 2630,
            "Damage Done": 13808654, "Networth": 5900149236, "Highest Level Beaten": 100,
            "Best Damage Made": 6365, "Best Kill Streak": 93}}}}
}


@pytest.mark.asyncio
async def test_fetch_enemy_members(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_ENEMY_MEMBERS
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        members = await client.fetch_enemy_members(9420)
    assert len(members) == 1
    assert members[0].name == "DarkMagic"


@pytest.mark.asyncio
async def test_fetch_faction_info(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_FACTION_INFO
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        info = await client.fetch_faction_info(9420)
    assert info.name == "The Pusheen Army"
    assert info.wins == 62


@pytest.mark.asyncio
async def test_fetch_tornstats_spy(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_TORNSTATS_SPY
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        spy = await client.fetch_tornstats_spy(9420, "fake_key")
    assert 183527 in spy
    assert spy[183527].xanax_taken == 2002


@pytest.mark.asyncio
async def test_fetch_tornstats_faction_battle_stats(client):
    """Battle stats come from member_data["spy"], NOT member_data["personalstats"]."""
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_TORNSTATS_SPY
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        battle = await client.fetch_tornstats_faction_battle_stats(9420, "fake_key")
    assert 183527 in battle
    assert battle[183527]["strength"] == 1_500_000_000
    assert battle[183527]["total"] == 6_000_000_000
    assert battle[183527]["timestamp"] == 1778500000


@pytest.mark.asyncio
async def test_fetch_tornstats_faction_battle_stats_skips_members_without_spy(client):
    """Members without a 'spy' block (no spy data available) must be skipped,
    not written as zeros. The previous bug overwrote real data with zeros
    every 30 min."""
    response = {
        "status": True,
        "faction": {"members": {
            "111": {"name": "WithSpy", "id": 111,
                    "spy": {"strength": 1e9, "defense": 1e9, "speed": 1e9, "dexterity": 1e9, "total": 4e9}},
            "222": {"name": "NoSpy", "id": 222},  # No 'spy' key at all
            "333": {"name": "EmptySpy", "id": 333, "spy": {}},  # Empty spy block
        }}
    }
    mock_resp = AsyncMock()
    mock_resp.json.return_value = response
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        battle = await client.fetch_tornstats_faction_battle_stats(9420, "fake_key")
    assert 111 in battle
    assert 222 not in battle
    assert 333 not in battle


@pytest.mark.asyncio
async def test_fetch_tornstats_faction_battle_stats_status_false(client):
    """status=False (e.g. TornStats error / no data) returns empty dict, not raise."""
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"status": False, "message": "No spies."}
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        battle = await client.fetch_tornstats_faction_battle_stats(9420, "fake_key")
    assert battle == {}


FAKE_YATA_MEMBERS = {
    "members": {
        "123": {
            "id": 123, "name": "TestPlayer", "status": "online", "last_action": 1711500000,
            "dif": 365, "energy_share": 1, "energy": 87, "refill": False,
            "drug_cd": 14400, "revive": True, "nnb_share": 1, "nnb": 45,
            "crimes_rank": 5, "bonus_score": 120, "carnage": 2,
            "stats_share": -1, "stats_dexterity": 0, "stats_defense": 0,
            "stats_speed": 0, "stats_strength": 0, "stats_total": 0,
        }
    },
    "timestamp": 1711500000,
}

@pytest.mark.asyncio
async def test_fetch_yata_members(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_YATA_MEMBERS
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        data = await client.fetch_yata_members()
    assert data is not None
    assert "123" in data
    assert data["123"]["energy"] == 87
    assert data["123"]["drug_cd"] == 14400


@pytest.mark.asyncio
async def test_fetch_yata_members_timeout(client):
    with patch.object(client._http, "get", side_effect=httpx.TimeoutException("timeout")):
        data = await client.fetch_yata_members()
    assert data is None


@pytest.mark.asyncio
async def test_fetch_yata_members_error_response(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"error": {"error": "Invalid key", "code": 2}}
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        data = await client.fetch_yata_members()
    assert data is None


@pytest.mark.asyncio
async def test_yata_caching(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_YATA_MEMBERS
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        await client.fetch_yata_members()
        await client.fetch_yata_members()
    mock_get.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_user_profile_stats(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {
        "personalstats": {"xantaken": 200, "refills": 100, "attackswon": 3000},
        "level": 45,
        "age": 800,
        "name": "TargetPlayer",
    }
    mock_resp.raise_for_status = lambda: None
    mock_resp.status_code = 200

    with patch.object(client._http, "get", return_value=mock_resp):
        result = await client.fetch_user_profile_stats(12345)

    assert result is not None
    assert result["level"] == 45
    assert result["name"] == "TargetPlayer"
    assert result["personalstats"]["xantaken"] == 200


@pytest.mark.asyncio
async def test_fetch_user_profile_stats_caching(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {
        "personalstats": {}, "level": 10, "age": 100, "name": "Cached",
    }
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        await client.fetch_user_profile_stats(99999)
        await client.fetch_user_profile_stats(99999)
    mock_get.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_user_profile_stats_error(client):
    async def _raise(*a, **kw):
        raise Exception("API error")
    with patch.object(client._http, "get", side_effect=_raise):
        result = await client.fetch_user_profile_stats(77777)
    assert result is None


@pytest.mark.asyncio
async def test_fetch_company_catalog(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {
        "companies": {
            "1": {
                "name": "Hair Salon",
                "cost": 500000,
                "default_employees": 3,
                "positions": [{"name": "Stylist", "man_required": 0, "int_required": 0, "end_required": 0}],
                "stock": [{"name": "Shampoo", "cost": 10, "rrp": 25}],
                "specials": [{"name": "Perm", "effect": "+2 happiness", "cost": 1, "rating_required": 1}],
            }
        }
    }
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        result = await client.fetch_company_catalog()

    assert "1" in result
    assert result["1"]["name"] == "Hair Salon"
    assert len(result["1"]["specials"]) == 1


def _make_resp(payload: dict) -> AsyncMock:
    mock_resp = AsyncMock()
    mock_resp.json.return_value = payload
    mock_resp.raise_for_status = lambda: None
    return mock_resp


@pytest.mark.asyncio
async def test_fetch_company_detailed_as_director(client):
    payload = {
        "company_bank": 100_000_000,
        "company_funds": 50_000_000,
        "advertising_budget": 1_000_000,
        "popularity": 8000,
        "efficiency": 7500,
        "environment": 500,
        "trains_available": 3,
        "value": 500_000_000,
        "upgrades": {"company_size": 10, "staffroom_size": "medium", "storage_size": "large", "storage_space": 300},
    }
    with patch.object(client._http, "get", return_value=_make_resp(payload)):
        result = await client.fetch_company_detailed()
    assert result is not None
    assert result["company_funds"] == 50_000_000
    assert result["upgrades"]["company_size"] == 10


@pytest.mark.asyncio
async def test_fetch_company_detailed_non_director_returns_none(client):
    # Torn returns error code 7 when access level too low
    with patch.object(client._http, "get", return_value=_make_resp({"error": {"code": 7, "error": "Incorrect"}})):
        result = await client.fetch_company_detailed()
    assert result is None


@pytest.mark.asyncio
async def test_fetch_company_employees(client):
    payload = {
        "company_employees": {
            "123": {
                "name": "Alice",
                "position": "Manager",
                "days_in_company": 90,
                "wage": 50000,
                "manual_labor": 1000,
                "intelligence": 800,
                "endurance": 500,
                "effectiveness": {"total": 85, "working_stats": 30, "addiction": 10, "inactivity": 0, "merits": 5, "director_education": 20, "settled_in": 20},
                "last_action": {"relative": "1 min ago", "status": "Online", "timestamp": 1774600000},
                "status": {"color": "green", "state": "Okay", "description": "Okay", "details": "", "until": None},
            }
        }
    }
    with patch.object(client._http, "get", return_value=_make_resp(payload)):
        result = await client.fetch_company_employees()
    assert "company_employees" in result
    assert result["company_employees"]["123"]["effectiveness"]["total"] == 85


@pytest.mark.asyncio
async def test_fetch_company_applications(client):
    payload = {
        "applications": {
            "456": {
                "userID": 456,
                "name": "Bob",
                "level": 30,
                "message": "hire me",
                "stats": {"manual_labor": 500, "intelligence": 300, "endurance": 200},
                "status": "active",
                "expires": 1775000000,
            }
        }
    }
    with patch.object(client._http, "get", return_value=_make_resp(payload)):
        result = await client.fetch_company_applications()
    assert list(result["applications"].keys()) == ["456"]


@pytest.mark.asyncio
async def test_fetch_company_stock(client):
    payload = {
        "company_stock": {
            "Shampoo": {"cost": 10, "in_stock": 500, "on_order": 0, "price": 25, "rrp": 25, "sold_amount": 1000, "sold_worth": 25000},
        }
    }
    with patch.object(client._http, "get", return_value=_make_resp(payload)):
        result = await client.fetch_company_stock()
    assert result["company_stock"]["Shampoo"]["in_stock"] == 500


@pytest.mark.asyncio
async def test_fetch_company_news(client):
    payload = {"news": {"1": {"news": "Alice was hired", "timestamp": 1774600000}}}
    with patch.object(client._http, "get", return_value=_make_resp(payload)) as mock_get:
        result = await client.fetch_company_news(from_ts=1774000000, limit=50)
    assert result["news"]["1"]["timestamp"] == 1774600000
    # verify query params forwarded
    _, kwargs = mock_get.call_args
    assert kwargs["params"]["from"] == 1774000000
    assert kwargs["params"]["limit"] == 50
    assert kwargs["params"]["selections"] == "news"


@pytest.mark.asyncio
async def test_fetch_company_profile_public(client):
    payload = {
        "company": {
            "ID": 50000,
            "name": "Test Co",
            "company_type": 34,
            "rating": 10,
            "director": 999,
            "employees_hired": 8,
            "employees_capacity": 10,
            "daily_income": 5_000_000,
            "daily_customers": 2000,
            "weekly_income": 35_000_000,
            "weekly_customers": 14000,
            "days_old": 365,
            "employees": {},
        }
    }
    with patch.object(client._http, "get", return_value=_make_resp(payload)) as mock_get:
        result = await client.fetch_company_profile(50000)
    assert result["company"]["name"] == "Test Co"
    args, _ = mock_get.call_args
    assert "/company/50000" in args[0]


@pytest.mark.asyncio
async def test_fetch_tornstats_efficiency(client):
    payload = {
        "status": True,
        "message": "ok",
        "manual_labor": 1000,
        "intelligence": 500,
        "endurance": 500,
        "companies": {
            "Hair Salon": {"Stylist": 95, "Manager": 80},
        },
    }
    with patch.object(client._http, "get", return_value=_make_resp(payload)) as mock_get:
        result = await client.fetch_tornstats_efficiency(
            "tskey", manual_labor=1000, intelligence=500, endurance=500
        )
    assert result["status"] is True
    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"man": 1000, "int": 500, "end": 500}


@pytest.mark.asyncio
async def test_fetch_tornstats_efficiency_caches(client):
    payload = {"status": True, "companies": {}}
    with patch.object(client._http, "get", return_value=_make_resp(payload)) as mock_get:
        await client.fetch_tornstats_efficiency("tskey", manual_labor=1, intelligence=2, endurance=3)
        await client.fetch_tornstats_efficiency("tskey", manual_labor=1, intelligence=2, endurance=3)
    assert mock_get.call_count == 1


@pytest.mark.asyncio
async def test_fetch_tornstats_efficiency_error_returns_none(client):
    async def _raise(*a, **kw):
        raise Exception("boom")
    with patch.object(client._http, "get", side_effect=_raise):
        result = await client.fetch_tornstats_efficiency(
            "tskey", manual_labor=1, intelligence=2, endurance=3
        )
    assert result is None


# ─── v1-fallback shape regression tests ───────────────────────────────────────
# These three selections live on v1 because v2 changed their shape in ways that
# break our consumers (dict → list). When someone tries to flip the URL to v2
# again, these tests must fail loudly. Fixtures captured by
# `scripts/probe_torn_shapes.py capture` against the live API.
# See docs/torn-api-v2-migration.md for the exact mismatches.

from tests.fixtures.torn import load_torn_fixture  # noqa: E402


@pytest.mark.asyncio
async def test_fetch_stock_market_uses_v1(client):
    # NB: v1 shape — see docs/torn-api-v2-migration.md (torn/?selections=stocks).
    # v1 returns stocks as a dict keyed by stock_id; v2 returns a list.
    # fetch_stock_market consumers iterate .items(), so flipping to v2 breaks them.
    mock_resp = AsyncMock()
    mock_resp.json.return_value = load_torn_fixture("torn_stocks_v1")
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        stocks = await client.fetch_stock_market()

    assert mock_get.call_args.args[0].startswith("https://api.torn.com/torn/"), (
        "fetch_stock_market must use V1_BASE — v2 stocks shape is a list, not a dict"
    )
    assert isinstance(stocks, dict), "v1 torn/stocks returns dict keyed by stock_id"
    assert stocks, "fixture should have at least one stock"
    sample_key = next(iter(stocks))
    assert isinstance(sample_key, str) and sample_key.isdigit(), (
        "v1 keys are numeric strings"
    )
    sample = stocks[sample_key]
    # Field names from v1 (flat) — would be nested under `market.*` in v2.
    for required in ("acronym", "current_price", "market_cap", "total_shares", "stock_id"):
        assert required in sample, f"v1 stock missing flat field '{required}'"


@pytest.mark.asyncio
async def test_fetch_user_stocks_uses_v1(client):
    # NB: v1 shape — see docs/torn-api-v2-migration.md (user/?selections=stocks).
    # v1: dict keyed by stock_id with {total_shares, transactions: dict}.
    # v2: list with {id, shares, transactions: list}. Portfolio router reads v1.
    mock_resp = AsyncMock()
    mock_resp.json.return_value = load_torn_fixture("user_stocks_v1")
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        stocks = await client.fetch_user_stocks("fake_key")

    assert mock_get.call_args.args[0].startswith("https://api.torn.com/user/"), (
        "fetch_user_stocks must use V1_BASE — v2 user/stocks shape is a list"
    )
    assert isinstance(stocks, dict), "v1 user/stocks returns dict keyed by stock_id"
    assert stocks, "fixture should have at least one holding"
    sample = stocks[next(iter(stocks))]
    assert "total_shares" in sample, "v1 user/stocks has flat total_shares"
    assert isinstance(sample.get("transactions"), dict), (
        "v1 transactions is a dict keyed by tx_id; v2 makes it a list"
    )


@pytest.mark.asyncio
async def test_fetch_honor_catalog_uses_v1(client):
    # NB: v1 shape — see docs/torn-api-v2-migration.md (torn/?selections=honors,medals).
    # v1: two dicts keyed by id. v2: lists. collect_circulation iterates .items().
    mock_resp = AsyncMock()
    mock_resp.json.return_value = load_torn_fixture("torn_honors_medals_v1")
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        catalog = await client.fetch_honor_catalog()

    assert mock_get.call_args.args[0].startswith("https://api.torn.com/torn/"), (
        "fetch_honor_catalog must use V1_BASE — v2 honors/medals are lists"
    )
    assert isinstance(catalog, dict)
    assert isinstance(catalog["honors"], dict), "v1 honors is a dict keyed by id"
    assert isinstance(catalog["medals"], dict), "v1 medals is a dict keyed by id"
    sample_honor = next(iter(catalog["honors"].values()))
    for required in ("circulation", "description", "name", "rarity"):
        assert required in sample_honor, f"v1 honor missing field '{required}'"


# ── Regression: defensive handling of malformed Torn responses (Sentry hotfixes) ─────────
# Both bugs reported via Sentry on 2026-05-15: fetch_members KeyError on missing key
# (Sentry PYTHON-FASTAPI-J/G/K) and fetch_honor_catalog AttributeError when collect_circulation
# job iterated .items() on a list (Sentry PYTHON-FASTAPI-E). torn_client now normalizes
# both shapes so callers see the expected contract regardless of upstream hiccups.


@pytest.mark.asyncio
async def test_fetch_members_missing_key_returns_empty(client):
    """Torn occasionally returns 200 with payload missing `members` — don't 500."""
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {}  # no `members` key at all
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        members = await client.fetch_members()

    assert members == [], "missing `members` key must yield empty list, not KeyError"


@pytest.mark.asyncio
async def test_fetch_members_non_list_members_returns_empty(client):
    """If `members` arrives as the wrong type (e.g. dict on a shape drift) — don't crash."""
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"members": {"unexpected": "shape"}}
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        members = await client.fetch_members()

    assert members == []


@pytest.mark.asyncio
async def test_fetch_members_http_error_still_raises(client):
    """Real HTTP failures must still propagate — only the missing-key case is demoted."""
    mock_resp = AsyncMock()

    def _raise():
        raise httpx.HTTPStatusError("boom", request=None, response=None)

    mock_resp.raise_for_status = _raise

    with patch.object(client._http, "get", return_value=mock_resp):
        with pytest.raises(httpx.HTTPStatusError):
            await client.fetch_members()


@pytest.mark.asyncio
async def test_fetch_honor_catalog_normalizes_list_drift(client):
    """If Torn ever returns honors/medals as lists (v2 drift leaking into v1 frozen API
    or an error payload), normalize to dict-keyed-by-id so collect_circulation's
    .items() iteration doesn't AttributeError."""
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {
        "honors": [
            {"id": 1, "name": "First Blood", "circulation": 12345, "rarity": "Common"},
            {"id": 2, "name": "Hospitalized", "circulation": 8000, "rarity": "Common"},
        ],
        "medals": [
            {"id": 99, "name": "OG Player", "circulation": 50, "rarity": "Legendary"},
        ],
    }
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        catalog = await client.fetch_honor_catalog()

    assert isinstance(catalog["honors"], dict), "list shape must be normalized to dict"
    assert isinstance(catalog["medals"], dict)
    # Caller (collect_circulation) iterates .items() — must not raise
    for hid, h in catalog["honors"].items():
        assert h["circulation"] > 0
    assert "99" in catalog["medals"]
    assert catalog["medals"]["99"]["name"] == "OG Player"


@pytest.mark.asyncio
async def test_fetch_honor_catalog_garbage_returns_empty(client):
    """Garbage shape (neither dict nor list) — return empty dict, not crash."""
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"honors": "not_a_collection", "medals": None}
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        catalog = await client.fetch_honor_catalog()

    assert catalog["honors"] == {}
    assert catalog["medals"] == {}
    # collect_circulation pattern: `.items()` must work
    list(catalog["honors"].items())
    list(catalog["medals"].items())
