"""Live entity resolver tests (Task #4).

Exercises the per-kind resolver helpers + the batch entry point.
TornClient is mocked at the method level — no real HTTP.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from api import chat_resolver


# ---------------------------------------------------------------------------
# Test fakes
# ---------------------------------------------------------------------------


class _FakeTornClient:
    """Mocks the small slice of TornClient the resolver touches."""

    def __init__(self) -> None:
        self.fetch_user_basic = AsyncMock()
        self.fetch_faction_info = AsyncMock()
        self.fetch_ranked_wars = AsyncMock(return_value=[])
        self.fetch_war = AsyncMock(return_value=None)
        self._api_key = "test"

    def reset(self) -> None:
        for m in (
            self.fetch_user_basic,
            self.fetch_faction_info,
            self.fetch_ranked_wars,
            self.fetch_war,
        ):
            m.reset_mock()


@pytest.fixture(autouse=True)
def _reset_resolver_cache() -> None:
    chat_resolver._cache.clear()


@pytest.fixture
def tc() -> _FakeTornClient:
    return _FakeTornClient()


class _FactionInfoStub:
    """Stand-in for api.models.FactionInfo — MagicMock(name=...) collides
    with mock's own ``name`` attribute, so we use a plain object."""

    def __init__(self, **kwargs) -> None:
        for k, v in kwargs.items():
            setattr(self, k, v)


# ---------------------------------------------------------------------------
# Player resolver
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_player_returns_card_shape(tc: _FakeTornClient) -> None:
    tc.fetch_user_basic.return_value = {
        "name": "Bombel",
        "level": 100,
        "faction": {"faction_tag": "TM", "faction_id": 11559},
        "status": {"state": "Okay", "description": "Okay"},
        "last_action": {"relative": "5 minutes ago"},
    }
    card = await chat_resolver.resolve_player(tc, 2362436)
    assert card is not None
    assert card["kind"] == "player"
    assert card["id"] == 2362436
    assert card["name"] == "Bombel"
    assert card["level"] == 100
    assert card["faction_tag"] == "TM"
    assert card["status_text"] == "Okay"
    assert card["status_color"] == "green"
    assert card["last_action_text"] == "5 minutes ago"
    assert card["attack_url"].endswith("user2ID=2362436")


@pytest.mark.asyncio
async def test_resolve_player_hospital_is_red(tc: _FakeTornClient) -> None:
    tc.fetch_user_basic.return_value = {
        "name": "Foo",
        "level": 50,
        "faction": {"faction_tag": "", "faction_id": 0},
        "status": {"state": "Hospital", "description": "In hospital for 2h"},
        "last_action": {"relative": "1 hour ago"},
    }
    card = await chat_resolver.resolve_player(tc, 1)
    assert card["status_color"] == "red"
    assert card["status_text"].startswith("Hospital") or "hospital" in card["status_text"].lower()


@pytest.mark.asyncio
async def test_resolve_player_traveling_is_blue(tc: _FakeTornClient) -> None:
    tc.fetch_user_basic.return_value = {
        "name": "Trav",
        "level": 50,
        "faction": {"faction_tag": "TM", "faction_id": 11559},
        "status": {"state": "Traveling", "description": "Traveling to Mexico"},
        "last_action": {"relative": "30 mins ago"},
    }
    card = await chat_resolver.resolve_player(tc, 1)
    assert card["status_color"] == "blue"


@pytest.mark.asyncio
async def test_resolve_player_handles_fetch_failure(tc: _FakeTornClient) -> None:
    tc.fetch_user_basic.return_value = None
    card = await chat_resolver.resolve_player(tc, 999)
    assert card is None


@pytest.mark.asyncio
async def test_resolve_player_caches_between_calls(tc: _FakeTornClient) -> None:
    tc.fetch_user_basic.return_value = {
        "name": "X",
        "level": 1,
        "faction": {"faction_tag": "", "faction_id": 0},
        "status": {"state": "Okay", "description": "Okay"},
        "last_action": {"relative": "now"},
    }
    chat_resolver._cache.clear()
    await chat_resolver.resolve_player(tc, 42)
    await chat_resolver.resolve_player(tc, 42)
    assert tc.fetch_user_basic.call_count == 1


# ---------------------------------------------------------------------------
# Item resolver
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_item_uses_items_cache(monkeypatch, tc: _FakeTornClient) -> None:
    fake_items = [
        {"id": 206, "name": "Xanax", "type": "Drug", "market_value": 800000, "circulation": 1234},
        {"id": 1, "name": "Hammer", "type": "Melee", "market_value": 1000, "circulation": 10},
    ]

    async def fake_ensure(_tc=None):
        return fake_items

    monkeypatch.setattr("api.routers.market.ensure_items_cache", fake_ensure)
    chat_resolver._cache.clear()
    card = await chat_resolver.resolve_item(tc, 206)
    assert card is not None
    assert card["kind"] == "item"
    assert card["id"] == 206
    assert card["name"] == "Xanax"
    assert card["market_low"] == 800000
    assert card["type"] == "Drug"
    assert card["image"].startswith("https://www.torn.com/images/items/206/")


@pytest.mark.asyncio
async def test_resolve_item_unknown_id_returns_none(monkeypatch, tc: _FakeTornClient) -> None:
    async def fake_ensure(_tc=None):
        return [{"id": 1, "name": "Hammer", "type": "Melee", "market_value": 1000, "circulation": 10}]

    monkeypatch.setattr("api.routers.market.ensure_items_cache", fake_ensure)
    chat_resolver._cache.clear()
    card = await chat_resolver.resolve_item(tc, 9999)
    assert card is None


# ---------------------------------------------------------------------------
# Faction resolver
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_faction_returns_card(tc: _FakeTornClient) -> None:
    tc.fetch_faction_info.return_value = _FactionInfoStub(
        id=11559, name="The Masters", tag="TM", respect=12345,
        members_count=50, rank_name="Diamond II", rank_level=12,
        best_chain=100, wins=10,
    )
    chat_resolver._cache.clear()
    card = await chat_resolver.resolve_faction(tc, 11559)
    assert card is not None
    assert card["kind"] == "faction"
    assert card["id"] == 11559
    assert card["name"] == "The Masters"
    assert card["tag"] == "TM"
    assert card["members_count"] == 50
    assert card["respect"] == 12345


@pytest.mark.asyncio
async def test_resolve_faction_handles_failure(tc: _FakeTornClient) -> None:
    tc.fetch_faction_info.side_effect = Exception("boom")
    chat_resolver._cache.clear()
    card = await chat_resolver.resolve_faction(tc, 1)
    assert card is None


# ---------------------------------------------------------------------------
# Ranked war resolver
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_rankedwar_history(tc: _FakeTornClient) -> None:
    # Past war (winner present, end < now)
    tc.fetch_ranked_wars.return_value = [
        {
            "war": {"start": 100, "end": 200, "winner": 11559, "target": 5000},
            "factions": {
                "11559": {"name": "The Masters", "score": 5000, "chain": 100},
                "9999": {"name": "Other", "score": 4500, "chain": 90},
            },
        }
    ]
    chat_resolver._cache.clear()
    # War id in torn URLs is faction_id of one side OR the war's own id —
    # both formats accepted via lookup. Use faction_id 11559 (TM) as id.
    card = await chat_resolver.resolve_rankedwar(tc, 11559)
    assert card is not None
    assert card["kind"] == "rankedwar"
    assert card["ended"] is True
    assert card["score_us"] in (5000, 4500)
    assert card["score_them"] in (5000, 4500)
    assert card["opponent_name"] in ("The Masters", "Other")


@pytest.mark.asyncio
async def test_resolve_rankedwar_unknown_returns_none(tc: _FakeTornClient) -> None:
    tc.fetch_ranked_wars.return_value = []
    chat_resolver._cache.clear()
    card = await chat_resolver.resolve_rankedwar(tc, 42)
    assert card is None


# ---------------------------------------------------------------------------
# Batch entry point
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_batch_dedupes_and_returns_dict(monkeypatch, tc: _FakeTornClient) -> None:
    tc.fetch_user_basic.return_value = {
        "name": "X", "level": 1,
        "faction": {"faction_tag": "", "faction_id": 0},
        "status": {"state": "Okay", "description": "Okay"},
        "last_action": {"relative": "now"},
    }

    async def fake_ensure(_tc=None):
        return [{"id": 206, "name": "Xanax", "type": "Drug", "market_value": 800000, "circulation": 1}]

    monkeypatch.setattr("api.routers.market.ensure_items_cache", fake_ensure)
    chat_resolver._cache.clear()

    refs = [
        {"kind": "player", "id": 1},
        {"kind": "player", "id": 1},  # dup
        {"kind": "item", "id": 206},
    ]
    out = await chat_resolver.resolve_batch(tc, refs)
    assert isinstance(out, dict)
    assert "player:1" in out
    assert "item:206" in out
    # Dedup: only one fetch for player 1
    assert tc.fetch_user_basic.call_count == 1


@pytest.mark.asyncio
async def test_resolve_batch_skips_invalid_refs(tc: _FakeTornClient) -> None:
    chat_resolver._cache.clear()
    out = await chat_resolver.resolve_batch(
        tc,
        [
            {"kind": "player", "id": None},  # no id, skip
            {"kind": "unknown", "id": 1},  # unknown kind, skip
            {"kind": "player"},  # missing id, skip
        ],
    )
    assert out == {}
    assert tc.fetch_user_basic.call_count == 0


@pytest.mark.asyncio
async def test_resolve_batch_caps_size(tc: _FakeTornClient) -> None:
    """The endpoint must refuse absurd batch sizes to protect the API budget."""
    refs = [{"kind": "player", "id": i} for i in range(1, 200)]
    with pytest.raises(ValueError):
        await chat_resolver.resolve_batch(tc, refs)


# ---------------------------------------------------------------------------
# HTTP endpoint (POST /api/chat/entities/resolve)
# ---------------------------------------------------------------------------


def _mount_app_with_stubs(resolve_results: dict[str, Any]):
    """Mount the chat router with a fake resolver and key_store."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from unittest.mock import patch

    from api.routers.chat import router as chat_router

    app = FastAPI()
    app.include_router(chat_router)

    class _Store:
        def has_key(self, _pid: int) -> bool:
            return True

        def is_admin(self, _pid: int) -> bool:
            return False

    async def fake_resolve(_tc, _refs, **_kwargs):
        return resolve_results

    patches = [
        patch("api.routers.chat.chat_repo", object()),
        patch("api.routers.chat.chat_manager", object()),
        patch("api.routers.chat.key_store", _Store()),
        patch("api.routers.chat.settings_repo", None),
        patch("api.routers.chat.torn_client", object()),
        patch("api.chat_resolver.resolve_batch", fake_resolve),
    ]
    for p in patches:
        p.start()
    return app, patches, TestClient


def test_resolve_endpoint_returns_card_map() -> None:
    app, patches, TestClient = _mount_app_with_stubs({
        "player:2362436": {"kind": "player", "id": 2362436, "name": "Bombel"},
    })
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/entities/resolve",
                headers={"X-Player-Id": "2362436"},
                json={"entities": [{"kind": "player", "id": 2362436}]},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "entities" in body
        assert body["entities"]["player:2362436"]["name"] == "Bombel"
    finally:
        for p in patches:
            p.stop()


def test_resolve_endpoint_rejects_oversized_batch() -> None:
    app, patches, TestClient = _mount_app_with_stubs({})
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/entities/resolve",
                headers={"X-Player-Id": "2362436"},
                json={"entities": [{"kind": "player", "id": i} for i in range(1, 200)]},
            )
        assert resp.status_code == 400, resp.text
    finally:
        for p in patches:
            p.stop()


def test_resolve_endpoint_requires_player_id_header() -> None:
    app, patches, TestClient = _mount_app_with_stubs({})
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/entities/resolve",
                json={"entities": []},
            )
        # FastAPI 422 on missing required header
        assert resp.status_code == 422, resp.text
    finally:
        for p in patches:
            p.stop()
