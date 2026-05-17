"""Sprint 2 #12 — ETag rollout to remaining Companion-hot endpoints.

For each newly-migrated endpoint, assert that:

1. The first GET returns 200 with a quoted strong ``ETag`` header.
2. A second GET with a matching ``If-None-Match`` returns 304 with empty body
   and the same ``ETag`` echoed back.

The point of these tests is to lock in the helper invariants at the router
boundary — once a route stops returning the bare dict and instead routes
through ``etag_response``, regressions (a contributor adding a new field
without going through the helper, an accidental ``return result``) flip the
test red immediately.

We mount each router in a one-off FastAPI app so we sidestep
``enforce_api_auth`` and only exercise the route under test. External
dependencies (torn_client, key_store, repos) are stubbed with MagicMock /
AsyncMock — these endpoints are integration-heavy and not the SUT here.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _assert_etag_roundtrip(client: TestClient, path: str, headers: dict | None = None):
    """Assert the ETag → 304 round-trip for a GET endpoint.

    Shared helper because every test does the same dance: GET once, capture
    the ETag, GET again with If-None-Match, expect 304 + empty body.
    """
    headers = headers or {}
    first = client.get(path, headers=headers)
    assert first.status_code == 200, (
        f"first GET {path} returned {first.status_code}: {first.text[:200]}"
    )
    etag = first.headers.get("etag")
    assert etag, f"first GET {path} missing ETag header; headers={dict(first.headers)}"
    assert etag.startswith('"') and etag.endswith('"'), (
        f"ETag must be quoted per RFC 7232, got {etag!r}"
    )

    second = client.get(path, headers={**headers, "If-None-Match": etag})
    assert second.status_code == 304, (
        f"second GET {path} expected 304, got {second.status_code}: {second.text[:200]}"
    )
    assert second.content == b"", "304 response must have empty body"
    assert second.headers.get("etag") == etag, "304 must echo the same ETag"


# ---------------------------------------------------------------------------
# /api/loot
# ---------------------------------------------------------------------------


@pytest.fixture
def loot_client(monkeypatch):
    """Wire api.routers.loot with a mocked TornStats HTTP response."""
    import api.routers.loot as mod

    tornstats_payload = {
        "status": True,
        "1": {
            "name": "Duke",
            "status": "Hospital",
            "hosp_out": 1_700_000_000,
            "updated": 1_700_000_000,
        },
    }

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json = MagicMock(return_value=tornstats_payload)

    mock_http = MagicMock()
    mock_http.get = AsyncMock(return_value=mock_resp)

    mock_client = MagicMock()
    mock_client._http = mock_http

    mock_repo = MagicMock()
    mock_repo.get_all.return_value = []

    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "tornstats_key", "fake-ts-key")
    monkeypatch.setattr(mod, "reservation_repo", mock_repo)
    # Reset the module-level cache so the fetch path runs deterministically.
    monkeypatch.setattr(mod, "_cache", None)
    monkeypatch.setattr(mod, "_cache_ts", 0.0)

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_loot_endpoint_returns_etag_then_304(loot_client):
    _assert_etag_roundtrip(loot_client, "/api/loot")


# ---------------------------------------------------------------------------
# /api/travel
# ---------------------------------------------------------------------------


@pytest.fixture
def travel_client(monkeypatch):
    import api.routers.travel as mod

    items_payload = {"items": {"258": {"name": "Xanax", "market_value": 800_000}}}

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json = MagicMock(return_value=items_payload)

    mock_http = MagicMock()
    mock_http.get = AsyncMock(return_value=mock_resp)

    mock_client = MagicMock()
    mock_client._http = mock_http
    mock_client._api_key = "fake_api_key"
    mock_client.fetch_yata_travel_stocks = AsyncMock(return_value={"stocks": {}})

    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "_price_cache", None)
    monkeypatch.setattr(mod, "_price_cache_ts", 0.0)

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_travel_endpoint_returns_etag_then_304(travel_client):
    _assert_etag_roundtrip(travel_client, "/api/travel")


# ---------------------------------------------------------------------------
# /api/market/prices
# ---------------------------------------------------------------------------


@pytest.fixture
def market_client(monkeypatch):
    import api.routers.market as mod

    items_payload = {
        "items": {
            "1": {
                "name": "Test Item",
                "market_value": 1_000,
                "buy_price": 500,
                "sell_price": 400,
                "circulation": 42,
                "type": "Misc",
            }
        }
    }

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json = MagicMock(return_value=items_payload)

    mock_http = MagicMock()
    mock_http.get = AsyncMock(return_value=mock_resp)

    mock_client = MagicMock()
    mock_client._http = mock_http
    mock_client._api_key = "fake_api_key"
    mock_client.fetch_yata_travel_stocks = AsyncMock(return_value={"stocks": {}})

    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "_items_cache", None)
    monkeypatch.setattr(mod, "_items_cache_ts", 0.0)

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_market_prices_endpoint_returns_etag_then_304(market_client):
    _assert_etag_roundtrip(market_client, "/api/market/prices")


# ---------------------------------------------------------------------------
# /api/stocks/portfolio + /api/stocks/roi
# ---------------------------------------------------------------------------


@pytest.fixture
def stocks_client(monkeypatch):
    import api.routers.stocks as mod

    market = {
        "1": {
            "name": "Test Stock",
            "acronym": "TST",
            "current_price": 100.0,
            "market_cap": 0,
            "total_shares": 0,
            "investors": 0,
            "benefit": {"type": "", "description": "", "requirement": 0},
        }
    }
    portfolio = {
        "1": {
            "stock_id": 1,
            "total_shares": 10,
            "transactions": {
                "t1": {"shares": 10, "bought_price": 90.0, "time_bought": 1_700_000_000}
            },
            "benefit": {"ready": 0, "progress": 0, "frequency": 7},
            "dividend": {"ready": 0, "progress": 0, "frequency": 7},
        }
    }

    mock_client = MagicMock()
    mock_client.fetch_stock_market = AsyncMock(return_value=market)
    mock_client.fetch_user_stocks = AsyncMock(return_value=portfolio)
    mock_client._api_key = "fake_api_key"

    # /roi reuses _get_item_prices() which calls _http.get on torn/items.
    items_payload = {"items": {"1": {"name": "Test Item", "market_value": 5_000}}}
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json = MagicMock(return_value=items_payload)
    mock_http = MagicMock()
    mock_http.get = AsyncMock(return_value=mock_resp)
    mock_client._http = mock_http

    mock_key_store = MagicMock()
    mock_key_store.get_key.return_value = {
        "player_id": 42,
        "player_name": "Tester",
        "api_key": "user_key",
    }

    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "key_store", mock_key_store)
    monkeypatch.setattr(mod, "_item_prices_cache", {})
    monkeypatch.setattr(mod, "_item_prices_ts", 0.0)

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_stocks_portfolio_endpoint_returns_etag_then_304(stocks_client):
    _assert_etag_roundtrip(
        stocks_client, "/api/stocks/portfolio", headers={"X-Player-Id": "42"}
    )


def test_stocks_roi_endpoint_returns_etag_then_304(stocks_client):
    _assert_etag_roundtrip(
        stocks_client, "/api/stocks/roi", headers={"X-Player-Id": "42"}
    )


# ---------------------------------------------------------------------------
# /api/bounties
# ---------------------------------------------------------------------------


@pytest.fixture
def bounties_client(monkeypatch):
    import api.routers.bounties as mod

    mock_client = MagicMock()
    mock_client.fetch_bounties = AsyncMock(
        return_value=[
            {
                "target_id": 100,
                "target_name": "Mark",
                "target_level": 10,
                "lister_id": 200,
                "lister_name": "Lister",
                "reward": 1_000_000,
                "reason": "",
                "quantity": 1,
            },
        ]
    )
    mock_client.fetch_user_profile_stats = AsyncMock(return_value=None)
    mock_client.fetch_personalstats = AsyncMock(return_value=None)
    mock_client._api_key = "fake_api_key"

    mock_key_store = MagicMock()
    mock_key_store.get_key.return_value = {
        "player_id": 42,
        "player_name": "Tester",
        "api_key": "user_key",
    }

    mock_spy = MagicMock()
    mock_spy.repo.get_estimate.return_value = None
    mock_spy.repo.get_estimates_bulk.return_value = {}

    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "key_store", mock_key_store)
    monkeypatch.setattr(mod, "spy_service", mock_spy)

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_bounties_endpoint_returns_etag_then_304(bounties_client):
    _assert_etag_roundtrip(
        bounties_client, "/api/bounties", headers={"X-Player-Id": "42"}
    )


# ---------------------------------------------------------------------------
# /api/armoury/competitions + /api/armoury/competitions/{id}/leaderboard
# ---------------------------------------------------------------------------


@pytest.fixture
def armoury_client(monkeypatch):
    import api.routers.armoury as mod

    competitions = [
        {
            "id": 1,
            "name": "BB Comp",
            "category": "blood_bags",
            "items": None,
            "start_ts": 1000,
            "end_ts": 2000,
            "created_by": 42,
            "status": "active",
            "prize_text": None,
        }
    ]
    leaderboard_rows = [
        {
            "player_id": 42,
            "player_name": "Bombel",
            "total": 10,
            "deposits": 1,
            "last_deposit": 1500,
        }
    ]

    mock_repo = MagicMock()
    mock_repo.get_all_competitions.return_value = competitions
    mock_repo.get_competition.return_value = competitions[0]
    mock_repo.get_leaderboard.return_value = leaderboard_rows

    mock_key_store = MagicMock()
    mock_key_store.has_key.return_value = True
    mock_key_store.is_admin.return_value = False

    monkeypatch.setattr(mod, "repo", mock_repo)
    monkeypatch.setattr(mod, "key_store", mock_key_store)
    monkeypatch.setattr(mod, "torn_client", MagicMock())

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_armoury_competitions_endpoint_returns_etag_then_304(armoury_client):
    _assert_etag_roundtrip(
        armoury_client, "/api/armoury/competitions", headers={"X-Player-Id": "42"}
    )


def test_armoury_leaderboard_endpoint_returns_etag_then_304(armoury_client):
    _assert_etag_roundtrip(
        armoury_client,
        "/api/armoury/competitions/1/leaderboard",
        headers={"X-Player-Id": "42"},
    )


# ---------------------------------------------------------------------------
# /api/notifications/unread
# ---------------------------------------------------------------------------


@pytest.fixture
def notifications_client(monkeypatch):
    import api.routers.notifications as mod

    mock_repo = MagicMock()
    mock_repo.get_unread_count.return_value = 3

    mock_key_store = MagicMock()
    mock_key_store.has_key.return_value = True

    monkeypatch.setattr(mod, "notification_repo", mock_repo)
    monkeypatch.setattr(mod, "key_store", mock_key_store)

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_notifications_unread_endpoint_returns_etag_then_304(notifications_client):
    _assert_etag_roundtrip(
        notifications_client,
        "/api/notifications/unread",
        headers={"X-Player-Id": "42"},
    )
