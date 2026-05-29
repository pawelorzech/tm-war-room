"""Route tests for api/routers/mug.py."""
import asyncio
import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.routers.mug as mug_mod
from api.routers.mug import router as mug_router
from tests.helpers import TEST_JWT_SECRET, auth_headers

AUTH_HEADERS = auth_headers()  # X-Player-Id = 123 by convention


@pytest.fixture
def client(tmp_path):
    app = FastAPI()
    app.include_router(mug_router)

    store = MagicMock()
    store.has_key.side_effect = lambda pid: pid == 123
    store.get_key.side_effect = lambda pid: {"player_id": pid, "player_name": "Tester", "api_key": "k"} if pid == 123 else None

    repo = MagicMock()
    repo.last_mug_at.return_value = None
    repo.last_trade_at.return_value = None

    async def fake_signals(player_id, caller_id):
        from api.mug_score import MugSignals
        return MugSignals(
            caller_total=10_000_000, target_total=2_000_000,
            networth=6_000_000_000, property_type="Palace",
            last_action_status="Idle",
        )

    mug_mod.key_store = store
    mug_mod.mug_repo = repo
    mug_mod.target_repo = MagicMock(get_all=MagicMock(return_value=[]))
    with patch.object(mug_mod, "gather_signals", side_effect=fake_signals), \
         patch("api.main.JWT_SECRET", TEST_JWT_SECRET):
        yield TestClient(app)


def test_score_endpoint_returns_prime(client):
    r = client.get("/api/mug/score/100", headers=AUTH_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["player_id"] == 100
    assert body["tier"] == "prime"
    # raw = winnability 30 (ratio 5, capped) + money 24 (nw 6B=18 + Palace=6) + availability 20 (Idle) = 74
    assert body["score"] == 74
    assert "breakdown" in body


def test_score_requires_registered_member(client):
    r = client.get("/api/mug/score/100", headers=auth_headers(player_id=777))
    assert r.status_code == 401


def test_post_interaction_records_trade(client):
    r = client.post("/api/mug/interaction", json={"seller_player_id": 100, "kind": "trade", "source": "imarket"}, headers=AUTH_HEADERS)
    assert r.status_code == 200
    mug_mod.mug_repo.add_trade.assert_called_once()


def test_post_logged_records_mug(client):
    r = client.post("/api/mug/logged", json={"target_player_id": 100}, headers=AUTH_HEADERS)
    assert r.status_code == 200
    mug_mod.mug_repo.log_mug.assert_called_once()


def test_gather_signals_never_raises():
    from api.mug_score import MugSignals
    mug_mod.torn_client = None  # no live fetch
    mug_mod.key_store = MagicMock()
    mug_mod.mug_repo = MagicMock(
        last_mug_at=MagicMock(side_effect=Exception("boom")),
        last_trade_at=MagicMock(return_value=None),
    )
    sig = asyncio.run(mug_mod.gather_signals(100, 123))
    assert isinstance(sig, MugSignals)


def test_candidates_sorted_desc():
    app = FastAPI()
    app.include_router(mug_router)

    store = MagicMock()
    store.has_key.side_effect = lambda pid: pid == 123

    async def fake_signals(player_id, caller_id):
        from api.mug_score import MugSignals
        # id 2 is the weaker target → higher winnability → higher score.
        target_total = 1_000_000 if player_id == 2 else 50_000_000
        return MugSignals(
            caller_total=10_000_000, target_total=target_total,
            networth=6_000_000_000, property_type="Palace",
            last_action_status="Idle",
        )

    mug_mod.key_store = store
    mug_mod.mug_repo = MagicMock()
    mug_mod.target_repo = MagicMock(get_all=MagicMock(return_value=[
        {"player_id": 1, "player_name": "A"},
        {"player_id": 2, "player_name": "B"},
    ]))
    with patch.object(mug_mod, "gather_signals", side_effect=fake_signals), \
         patch("api.main.JWT_SECRET", TEST_JWT_SECRET):
        c = TestClient(app)
        r = c.get("/api/mug/candidates", headers=AUTH_HEADERS)
    assert r.status_code == 200
    cands = r.json()["candidates"]
    assert len(cands) == 2
    assert cands[0]["player_id"] == 2  # weaker target ranks first
    assert cands[0]["score"] >= cands[1]["score"]


def test_score_503_when_not_initialized():
    app = FastAPI()
    app.include_router(mug_router)

    mug_mod.key_store = MagicMock(has_key=MagicMock(return_value=True))
    mug_mod.mug_repo = None  # not initialized
    with patch("api.main.JWT_SECRET", TEST_JWT_SECRET):
        c = TestClient(app)
        r = c.get("/api/mug/score/100", headers=AUTH_HEADERS)
    assert r.status_code == 503
