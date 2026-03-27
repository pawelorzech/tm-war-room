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
