"""Regression tests for /api/wars route.

Guards the parallelization of the two Torn upstream calls that
`api.routers.wars.war_history` makes (`fetch_war_history` and
`fetch_ranked_wars`). These calls are independent and MUST run
concurrently via `asyncio.gather`, not serially.
"""

import asyncio
import time

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from tests.helpers import TEST_JWT_SECRET, auth_headers

AUTH_HEADERS = auth_headers()


@pytest.fixture(autouse=True)
def patch_route_jwt_secret():
    with patch("api.main.JWT_SECRET", TEST_JWT_SECRET), patch("api.routers.chat.JWT_SECRET", TEST_JWT_SECRET):
        yield


@pytest.fixture
def mock_store():
    store = MagicMock()
    registered = {
        123: {"player_id": 123, "player_name": "Test", "api_key": "fake_key", "is_faction_key": False},
    }
    store.get_all_keys.return_value = list(registered.values())
    store.get_key.side_effect = lambda player_id: registered.get(player_id)
    store.has_key.side_effect = lambda player_id: player_id in registered
    store.is_admin = MagicMock(return_value=False)
    return store


@pytest.mark.asyncio
async def test_war_history_fetches_history_and_ranked_concurrently(mock_store):
    """Perf: fetch_war_history + fetch_ranked_wars must run concurrently, not serially.

    Each upstream call sleeps 100ms. Serial = ~200ms, concurrent = ~100ms.
    We assert under 180ms to prove concurrency while leaving headroom for CI jitter.
    """
    war_history_payload = {
        "ranked": {
            "war_id": 42,
            "start": 1700000000,
            "end": 1700100000,
            "target": 5000,
            "winner": 11559,
            "factions": {
                "11559": {"name": "The Masters", "score": 5100, "chain": 100},
                "9999": {"name": "Rivals", "score": 4800, "chain": 80},
            },
        },
        "raids": {},
        "territory": {},
    }
    past_ranked_payload = [
        {
            "war_id": 41,
            "start": 1699900000,
            "end": 1699950000,
            "winner": 11559,
            "factions": {
                "11559": {"name": "The Masters", "score": 4000, "chain": 50},
                "8888": {"name": "Past Rival", "score": 3500, "chain": 40},
            },
        },
    ]

    async def slow_war_history():
        await asyncio.sleep(0.1)
        return war_history_payload

    async def slow_ranked_wars():
        await asyncio.sleep(0.1)
        return past_ranked_payload

    mock_client = AsyncMock()
    mock_client.fetch_war_history = AsyncMock(side_effect=slow_war_history)
    mock_client.fetch_ranked_wars = AsyncMock(side_effect=slow_ranked_wars)

    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store), \
         patch("api.routers.wars.torn_client", mock_client):
        transport = ASGITransport(app=__import__("api.main", fromlist=["app"]).app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            t0 = time.perf_counter()
            resp = await ac.get("/api/wars", headers=AUTH_HEADERS)
            elapsed = time.perf_counter() - t0

    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Shape sanity: ranked present, past_ranked present.
    assert data["ranked"]["war_id"] == 42
    assert isinstance(data["past_ranked"], list)
    assert len(data["past_ranked"]) == 1
    assert data["past_ranked"][0]["war_id"] == 41
    # Concurrency assertion: serial would be ~0.2s, concurrent ~0.1s. 0.18s leaves CI headroom.
    assert elapsed < 0.18, (
        f"Expected concurrent execution (<0.18s), got {elapsed:.3f}s — "
        "fetch_war_history and fetch_ranked_wars are running serially."
    )
