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
    }
}

FAKE_BARS_RESPONSE = {
    "energy": {"current": 500, "maximum": 150, "increment": 5, "interval": 600, "ticktime": 50, "fulltime": 0},
    "happy": {"current": 4000, "maximum": 4525, "increment": 5, "interval": 900, "ticktime": 350, "fulltime": 0},
    "cooldowns": {"drug": 3600, "medical": 0, "booster": 0},
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
         "position": "Tubby Kitten", "is_on_wall": False, "is_revivable": False, "is_in_oc": False}
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
