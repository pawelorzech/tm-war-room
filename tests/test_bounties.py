"""Tests for bounties router and threat scoring integration."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routers.bounties import router
from api.models import PersonalStats


FAKE_BOUNTIES = [
    {
        "target_id": 100,
        "target_name": "EasyTarget",
        "target_level": 10,
        "lister_id": 200,
        "lister_name": "Lister1",
        "reward": 1_000_000,
        "reason": "Annoying",
        "quantity": 1,
    },
    {
        "target_id": 101,
        "target_name": "HardTarget",
        "target_level": 80,
        "lister_id": 201,
        "lister_name": "Lister2",
        "reward": 5_000_000,
        "reason": "",
        "quantity": 3,
    },
]


@pytest.fixture
def bounties_setup(monkeypatch):
    """Set up bounties router with mocked dependencies.

    Sprint 2 #12: route now goes through ``etag_response`` and returns a
    ``Response`` object, so we exercise it via ``TestClient`` instead of
    calling the handler directly (would otherwise need to fabricate a
    Starlette ``Request`` per test).
    """
    import api.routers.bounties as mod

    mock_client = MagicMock()
    mock_client.fetch_bounties = AsyncMock(return_value=FAKE_BOUNTIES)
    mock_client.fetch_user_profile_stats = AsyncMock(return_value=None)
    mock_client.fetch_personalstats = AsyncMock(return_value=PersonalStats(
        xanax_taken=500, refills=200, attacks_won=5000, defends_won=300,
        networth=500_000_000, damage_done=3_000_000, best_kill_streak=30,
    ))
    mock_client._api_key = "test_key"

    mock_key_store = MagicMock()
    mock_key_store.get_all_keys.return_value = [
        {"player_id": 42, "api_key": "user_key", "player_name": "TestUser"},
    ]
    mock_key_store.get_key.side_effect = lambda pid: (
        {"player_id": 42, "api_key": "user_key", "player_name": "TestUser"}
        if pid == 42 else None
    )

    mock_spy = MagicMock()
    mock_spy.repo.get_estimate.return_value = None
    mock_spy.repo.get_all_estimates.return_value = []
    mock_spy.repo.get_estimates_bulk.return_value = {}

    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "key_store", mock_key_store)
    monkeypatch.setattr(mod, "spy_service", mock_spy)

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    return {
        "client": mock_client,
        "key_store": mock_key_store,
        "spy": mock_spy,
        "http": client,
    }


def _get_bounties(http: TestClient, player_id: int | None) -> dict:
    headers = {"X-Player-Id": str(player_id)} if player_id is not None else {}
    resp = http.get("/api/bounties", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_bounties_returns_threat_labels(bounties_setup):
    result = _get_bounties(bounties_setup["http"], 42)
    assert result["count"] == 2
    for b in result["bounties"]:
        assert "threat_label" in b
        assert "threat_score" in b
        assert b["threat_label"] in ("easy", "medium", "hard", "avoid", "unknown")


def test_bounties_relative_mode_with_player(bounties_setup):
    result = _get_bounties(bounties_setup["http"], 42)
    assert result["threat_mode"] == "relative"


def test_bounties_no_player_no_relative(bounties_setup):
    result = _get_bounties(bounties_setup["http"], None)
    assert result["threat_mode"] == "none"


def test_bounties_sorted_by_reward(bounties_setup):
    result = _get_bounties(bounties_setup["http"], None)
    rewards = [b["reward"] for b in result["bounties"]]
    assert rewards == sorted(rewards, reverse=True)


def test_bounties_with_spy_data(bounties_setup):
    """When spy data exists, it should be used for threat scoring."""
    mock_spy = bounties_setup["spy"]
    mock_spy.repo.get_estimates_bulk.return_value = {
        100: {"player_id": 100, "total": 50_000_000, "strength": 10e6, "defense": 10e6,
              "speed": 15e6, "dexterity": 15e6, "confidence": "estimate", "source": "tornstats"},
    }

    result = _get_bounties(bounties_setup["http"], 42)
    target_100 = next(b for b in result["bounties"] if b["target_id"] == 100)
    assert target_100["estimated_total"] == 50_000_000


def test_bounties_with_profile_lookup(bounties_setup):
    """When no spy data, falls back to personalstats lookup."""
    mock_client = bounties_setup["client"]
    mock_client.fetch_user_profile_stats.return_value = {
        "personalstats": {"xantaken": 100, "refills": 50, "attackswon": 1000,
                          "networth": 100_000_000, "attackdamage": 500_000},
        "level": 30,
        "age": 500,
        "name": "Target",
    }

    result = _get_bounties(bounties_setup["http"], 42)
    # At least one bounty should have threat data from profile lookup
    has_estimated = any(b["estimated_total"] and b["estimated_total"] > 0 for b in result["bounties"])
    assert has_estimated


def test_bounties_no_torn_client(bounties_setup):
    """Should return 503 when not initialized."""
    import api.routers.bounties as mod
    mod.torn_client = None
    resp = bounties_setup["http"].get("/api/bounties")
    assert resp.status_code == 503


def test_bounties_total_value(bounties_setup):
    result = _get_bounties(bounties_setup["http"], None)
    expected = sum(b["reward"] for b in FAKE_BOUNTIES)
    assert result["total_value"] == expected
