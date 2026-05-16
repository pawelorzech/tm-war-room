"""Tests for the TM Hub Companion (browser extension / userscript) endpoints."""
import os
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import (
    EXTENSION_TTL_HOURS,
    TOKEN_TYPE_EXTENSION,
    create_jwt,
    decode_jwt,
)
from api.db.migrations.runner import run_migrations
from tests.helpers import TEST_JWT_SECRET, auth_headers


# ---------- Unit tests for JWT extension type ----------


def test_create_extension_jwt_carries_scope_claim():
    token = create_jwt(
        player_id=2362436,
        player_name="Bombel",
        secret="s",
        expires_hours=EXTENSION_TTL_HOURS,
        token_type=TOKEN_TYPE_EXTENSION,
    )
    payload = decode_jwt(token, "s")
    assert payload is not None
    assert payload["token_type"] == TOKEN_TYPE_EXTENSION
    assert payload["sub"] == 2362436
    assert payload["exp"] - payload["iat"] == EXTENSION_TTL_HOURS * 3600


# ---------- Router tests ----------


class _FakeKeyStore:
    def __init__(self, members: dict[int, dict]):
        self._members = members

    def has_key(self, player_id: int) -> bool:
        return player_id in self._members

    def get_key(self, player_id: int) -> dict | None:
        return self._members.get(player_id)

    def is_admin(self, player_id: int) -> bool:
        return False


class _FakeWar:
    """Minimal stand-in for WarStatus."""
    def __init__(self, war_id, factions, start=1700000000, end=1700100000):
        self.war_id = war_id
        self.factions = factions
        self.start = start
        self.end = end


class _FakeFaction:
    def __init__(self, fid, name):
        self.id = fid
        self.name = name


class _FakeTornClient:
    def __init__(self, war=None):
        self._war = war

    async def fetch_war(self, *args, **kwargs):
        return self._war


@pytest.fixture
def client_no_war():
    from api.routers import extension as ext_mod

    ext_mod.key_store = _FakeKeyStore(members={100: {"player_id": 100, "player_name": "Owner"}})
    ext_mod.torn_client = _FakeTornClient(war=None)

    from api.routers import wars as wars_mod
    wars_mod.torn_client = _FakeTornClient(war=None)

    app = FastAPI()
    app.include_router(ext_mod.router)
    app.include_router(wars_mod.router)
    return TestClient(app)


@pytest.fixture
def client_active_war():
    """Active war: TM=11559 vs Opponent=99."""
    from api.routers import extension as ext_mod

    ext_mod.key_store = _FakeKeyStore(members={100: {"player_id": 100, "player_name": "Owner"}})
    war = _FakeWar(
        war_id=42,
        factions=[_FakeFaction(11559, "The Masters"), _FakeFaction(99, "Enemy Faction")],
    )
    ext_mod.torn_client = _FakeTornClient(war=war)

    from api.routers import wars as wars_mod
    wars_mod.torn_client = _FakeTornClient(war=war)

    app = FastAPI()
    app.include_router(ext_mod.router)
    app.include_router(wars_mod.router)
    return TestClient(app)


def test_issue_token_returns_extension_jwt(client_no_war):
    # Patch JWT_SECRET resolution in the router (it imports from api.config).
    with patch("api.routers.extension.JWT_SECRET", TEST_JWT_SECRET):
        resp = client_no_war.post(
            "/api/extension/issue-token",
            headers={"X-Player-Id": "100"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["player_id"] == 100
    assert body["player_name"] == "Owner"
    assert body["expires_hours"] == EXTENSION_TTL_HOURS
    payload = decode_jwt(body["ext_token"], TEST_JWT_SECRET)
    assert payload is not None
    assert payload["token_type"] == TOKEN_TYPE_EXTENSION
    assert payload["sub"] == 100
    assert payload["name"] == "Owner"


def test_issue_token_unregistered_player_returns_401(client_no_war):
    with patch("api.routers.extension.JWT_SECRET", TEST_JWT_SECRET):
        resp = client_no_war.post(
            "/api/extension/issue-token",
            headers={"X-Player-Id": "9999"},
        )
    assert resp.status_code == 401


def test_wars_current_returns_null_outside_war(client_no_war):
    resp = client_no_war.get("/api/wars/current")
    assert resp.status_code == 200
    body = resp.json()
    assert body["war_id"] is None
    assert body["opponent_faction_id"] is None


def test_wars_current_returns_war_id_and_opponent(client_active_war):
    resp = client_active_war.get("/api/wars/current")
    assert resp.status_code == 200
    body = resp.json()
    assert body["war_id"] == 42
    assert body["opponent_faction_id"] == 99
    assert body["opponent_name"] == "Enemy Faction"
    assert body["start"] == 1700000000
    assert body["end"] == 1700100000


class _FlakyTornClient:
    """fetch_war raises an httpx upstream error — simulates Torn API 504."""
    def __init__(self, exc):
        self._exc = exc

    async def fetch_war(self, *args, **kwargs):
        raise self._exc


@pytest.mark.parametrize(
    "exc_factory",
    [
        lambda: __import__("httpx").HTTPStatusError(
            "Server error '504 Gateway Timeout'",
            request=__import__("httpx").Request("GET", "https://api.torn.com/v2/faction"),
            response=__import__("httpx").Response(
                504,
                request=__import__("httpx").Request("GET", "https://api.torn.com/v2/faction"),
            ),
        ),
        lambda: __import__("httpx").TimeoutException("read timeout"),
        lambda: __import__("httpx").ConnectError("dns failed"),
        lambda: __import__("httpx").ReadError("connection reset"),
    ],
    ids=["504", "timeout", "connect", "read"],
)
def test_wars_current_returns_empty_on_upstream_error(exc_factory):
    """PYTHON-FASTAPI-G regression: Torn upstream errors must not crash /api/wars/current.

    Companion extension polls this endpoint — propagating 5xx/timeout to the
    extension would surface as UNHANDLED in Sentry every time Torn flakes.
    Treat upstream noise as 'no war info this cycle' and let the extension poll
    again.
    """
    from api.routers import wars as wars_mod
    wars_mod.torn_client = _FlakyTornClient(exc=exc_factory())

    app = FastAPI()
    app.include_router(wars_mod.router)
    client = TestClient(app)
    resp = client.get("/api/wars/current")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["war_id"] is None
    assert body["opponent_faction_id"] is None
    assert body["start"] is None
    assert body["end"] is None


# ---------- Integration: extension JWT accepted by middleware ----------


def test_extension_token_accepted_for_api_calls():
    """End-to-end: ext-scoped JWT passes the global auth middleware.

    Uses /api/status which has no key_store dependency, so the test doesn't
    require a full lifespan-initialized app. The contract under test is the
    middleware path — if it returns 401, the extension token type was rejected.
    """
    from unittest.mock import patch as _patch
    import api.main as main_mod

    with _patch.object(main_mod, "JWT_SECRET", TEST_JWT_SECRET):
        token = create_jwt(
            player_id=2362436,
            player_name="Bombel",
            secret=TEST_JWT_SECRET,
            expires_hours=EXTENSION_TTL_HOURS,
            token_type=TOKEN_TYPE_EXTENSION,
        )

        from api.main import app
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get(
                "/api/status",
                headers={
                    "X-Player-Id": "2362436",
                    "Authorization": f"Bearer {token}",
                },
            )
        # 401 would mean the extension token type was rejected by middleware.
        assert resp.status_code != 401, f"Extension JWT rejected: {resp.text}"
        # /api/status returns 200 once auth passes, regardless of key_store state.
        assert resp.status_code == 200, f"Unexpected status {resp.status_code}: {resp.text}"
