"""War-room pinned card endpoint (Task #9)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest


def _mount_app(*, war=None, enemy_payload=None, is_admin=False):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from api.routers.chat import router as chat_router

    app = FastAPI()
    app.include_router(chat_router)

    class _Store:
        def has_key(self, _pid):
            return True

        def is_admin(self, _pid):
            return is_admin

    class _TornClient:
        def __init__(self):
            self.fetch_war = AsyncMock(return_value=war)

    tc = _TornClient()

    async def fake_get_war_card(torn_client_arg=None, **_kw):
        # Bypasses the heavy enemy fetch — the endpoint should hand off to
        # this builder and just return its output. Tests for the builder
        # itself live below.
        if war is None or not war.war_id:
            return {"active": False}
        return {
            "active": True,
            "war_id": war.war_id,
            "opponent_name": "Bad Guys",
            "opponent_id": 99,
            "score_us": 1000,
            "score_them": 500,
            "target_score": 5000,
            "time_remaining_s": 3600,
            "top_targets": enemy_payload or [],
        }

    patches = [
        patch("api.routers.chat.chat_repo", object()),
        patch("api.routers.chat.chat_manager", object()),
        patch("api.routers.chat.key_store", _Store()),
        patch("api.routers.chat.settings_repo", None),
        patch("api.routers.chat.torn_client", tc),
        patch("api.chat_war_card.build_war_room_card", fake_get_war_card),
    ]
    for p in patches:
        p.start()
    return app, patches, TestClient


def test_war_room_endpoint_no_war_returns_inactive() -> None:
    app, patches, TestClient = _mount_app(war=None)
    try:
        with TestClient(app) as client:
            resp = client.get("/api/chat/war-room-card", headers={"X-Player-Id": "1"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["active"] is False
    finally:
        for p in patches:
            p.stop()


def test_war_room_endpoint_active_war_returns_card() -> None:
    war = SimpleNamespace(
        war_id=12345, start=100, end=999999, target=5000, winner=None,
        factions=[
            SimpleNamespace(id=11559, name="The Masters", score=1000, chain=10),
            SimpleNamespace(id=99, name="Bad Guys", score=500, chain=5),
        ],
    )
    app, patches, TestClient = _mount_app(
        war=war,
        enemy_payload=[
            {"id": 1, "name": "weak", "level": 30, "threat_label": "easy",
             "threat_score": 1, "attack_url": "https://x"},
            {"id": 2, "name": "weak2", "level": 31, "threat_label": "easy",
             "threat_score": 2, "attack_url": "https://x"},
        ],
    )
    try:
        with TestClient(app) as client:
            resp = client.get("/api/chat/war-room-card", headers={"X-Player-Id": "1"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["active"] is True
        assert body["war_id"] == 12345
        assert body["opponent_name"] == "Bad Guys"
        assert body["score_us"] == 1000
        assert body["score_them"] == 500
        assert len(body["top_targets"]) == 2
    finally:
        for p in patches:
            p.stop()


# ---------------------------------------------------------------------------
# build_war_room_card unit — exercise the real builder against a mock client
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_war_room_card_no_war() -> None:
    from api import chat_war_card

    tc = SimpleNamespace(fetch_war=AsyncMock(return_value=None))
    card = await chat_war_card.build_war_room_card(tc)
    assert card == {"active": False}


@pytest.mark.asyncio
async def test_build_war_room_card_caps_top_targets(monkeypatch) -> None:
    from api import chat_war_card

    war = SimpleNamespace(
        war_id=42, start=100, end=200, target=5000, winner=None,
        factions=[
            SimpleNamespace(id=11559, name="The Masters", score=100, chain=0),
            SimpleNamespace(id=99, name="Bad Guys", score=50, chain=0),
        ],
    )
    tc = SimpleNamespace(
        fetch_war=AsyncMock(return_value=war),
        fetch_enemy_members=AsyncMock(return_value=[
            SimpleNamespace(id=i, name=f"e{i}", level=10 + i, model_dump=lambda i=i: {
                "id": i, "name": f"e{i}", "level": 10 + i,
                "status": {"state": "Okay", "description": "Okay"},
                "last_action": {"status": "Online", "relative": "now"},
            })
            for i in range(1, 20)  # 19 enemies
        ]),
    )

    monkeypatch.setattr(chat_war_card, "_compute_threats", lambda mems, **_: [
        (m, idx + 1, "easy") for idx, m in enumerate(mems)  # ascending threat
    ])
    card = await chat_war_card.build_war_room_card(tc)
    assert card["active"] is True
    assert card["war_id"] == 42
    # Top 5 cap
    assert len(card["top_targets"]) == 5
    # Easiest first (lowest threat_score)
    assert card["top_targets"][0]["threat_score"] < card["top_targets"][-1]["threat_score"]


@pytest.mark.asyncio
async def test_build_war_room_card_skips_offline_targets(monkeypatch) -> None:
    from api import chat_war_card

    war = SimpleNamespace(
        war_id=1, start=0, end=999999, target=5000, winner=None,
        factions=[
            SimpleNamespace(id=11559, name="Us", score=100, chain=0),
            SimpleNamespace(id=99, name="Them", score=50, chain=0),
        ],
    )

    def mk(i, online, state="Okay"):
        return SimpleNamespace(
            id=i, name=f"e{i}", level=20 + i,
            model_dump=lambda i=i, online=online, state=state: {
                "id": i, "name": f"e{i}", "level": 20 + i,
                "status": {"state": state, "description": state},
                "last_action": {"status": "Online" if online else "Offline", "relative": "now"},
            },
        )

    tc = SimpleNamespace(
        fetch_war=AsyncMock(return_value=war),
        fetch_enemy_members=AsyncMock(return_value=[
            mk(1, online=True),
            mk(2, online=False),  # filtered
            mk(3, online=True, state="Hospital"),  # filtered
            mk(4, online=True),
        ]),
    )
    monkeypatch.setattr(chat_war_card, "_compute_threats", lambda mems, **_: [
        (m, 0, "easy") for m in mems
    ])
    card = await chat_war_card.build_war_room_card(tc)
    ids = [t["id"] for t in card["top_targets"]]
    assert 1 in ids and 4 in ids
    assert 2 not in ids and 3 not in ids
