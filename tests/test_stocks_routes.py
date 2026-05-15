"""Regression tests for /api/stocks/* routes.

Originally added to guard Sentry PYTHON-FASTAPI-H: Torn occasionally returns
`"stocks": []` (a list) for the user/stocks selection instead of the expected
dict keyed by stock id. The portfolio route iterated with `.items()`, which
exploded with `AttributeError: 'list' object has no attribute 'items'`.
"""

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


def _client_returning_portfolio(portfolio_payload):
    """Build a mock torn_client whose fetch_user_stocks returns the given payload."""
    client = AsyncMock()
    client.fetch_stock_market = AsyncMock(return_value={})
    client.fetch_user_stocks = AsyncMock(return_value=portfolio_payload)
    return client


@pytest.mark.asyncio
async def test_portfolio_handles_list_response_gracefully(mock_store):
    """Torn returning a list (instead of dict) must not crash with AttributeError."""
    mock_client = _client_returning_portfolio([])
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store), \
         patch("api.routers.stocks.torn_client", mock_client), patch("api.routers.stocks.key_store", mock_store):
        transport = ASGITransport(app=__import__("api.main", fromlist=["app"]).app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/stocks/portfolio", headers=AUTH_HEADERS)
    # Empty list is falsy → already hit the "no stock data" 403 path. Confirm it still does.
    assert resp.status_code == 403
    assert "No stock data" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_portfolio_handles_nonempty_list_response(mock_store):
    """Regression: non-empty list payload (rare Torn shape glitch) must not 500."""
    # Shape that historically crashed: v2-style list leaking through, or partial-access response.
    mock_client = _client_returning_portfolio([{"id": 1, "total_shares": 1000}])
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store), \
         patch("api.routers.stocks.torn_client", mock_client), patch("api.routers.stocks.key_store", mock_store):
        transport = ASGITransport(app=__import__("api.main", fromlist=["app"]).app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/stocks/portfolio", headers=AUTH_HEADERS)
    # Must NOT be 500. We treat the unknown shape as "no stock data" (403) rather than crash.
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    assert "No stock data" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_portfolio_happy_path_dict_response(mock_store):
    """Sanity: valid dict portfolio still returns 200 with holdings."""
    portfolio = {
        "14": {
            "stock_id": 14,
            "total_shares": 1000,
            "transactions": {
                "1": {"shares": 1000, "bought_price": 500.0, "time_bought": 1700000000},
            },
            "benefit": {"ready": 0, "progress": 0, "frequency": 7},
        },
    }
    market = {
        "14": {"name": "Test Stock", "acronym": "TST", "current_price": 600.0},
    }
    mock_client = AsyncMock()
    mock_client.fetch_stock_market = AsyncMock(return_value=market)
    mock_client.fetch_user_stocks = AsyncMock(return_value=portfolio)
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store), \
         patch("api.routers.stocks.torn_client", mock_client), patch("api.routers.stocks.key_store", mock_store):
        transport = ASGITransport(app=__import__("api.main", fromlist=["app"]).app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/stocks/portfolio", headers=AUTH_HEADERS)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["count"] == 1
    assert data["holdings"][0]["stock_id"] == 14
    assert data["holdings"][0]["total_shares"] == 1000
