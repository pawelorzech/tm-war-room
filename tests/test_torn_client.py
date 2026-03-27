import time
import pytest
import httpx
from unittest.mock import AsyncMock, patch

from app.torn_client import TornClient


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
