"""HTTP-layer tests for /api/flights/*.

The Phase 0 healthz smoke test is in tests/test_ff_route.py. These tests
exercise the Phase 2A behaviour: feature-flag gating and the two real
endpoints. The router is instantiated fresh per test with a TestClient so
nothing leaks between cases.
"""
from __future__ import annotations

import os
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.db.migrations.runner import run_migrations
from api.db.repos.flights import FlightRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "flights.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return FlightRepository(db_path=db_path)


def _client(repo, *, enabled: bool, monkeypatch) -> TestClient:
    from api import config
    from api.routers import flights as flights_mod

    monkeypatch.setattr(config, "ENABLE_FLIGHTS", enabled)
    monkeypatch.setattr(flights_mod, "flight_repo", repo)
    app = FastAPI()
    app.include_router(flights_mod.router)
    return TestClient(app)


def test_active_returns_503_when_flag_off(repo, monkeypatch):
    client = _client(repo, enabled=False, monkeypatch=monkeypatch)
    resp = client.get("/api/flights/active")
    assert resp.status_code == 503
    assert resp.json() == {"detail": "feature disabled"}


def test_player_endpoint_returns_503_when_flag_off(repo, monkeypatch):
    client = _client(repo, enabled=False, monkeypatch=monkeypatch)
    resp = client.get("/api/flights/100")
    assert resp.status_code == 503


def test_healthz_does_not_require_flag(repo, monkeypatch):
    """Liveness probe must always succeed so the deploy smoke test stays useful."""
    client = _client(repo, enabled=False, monkeypatch=monkeypatch)
    assert client.get("/api/flights/healthz").json() == {"ok": True}


def test_active_returns_open_flights_when_flag_on(repo, monkeypatch):
    now = int(time.time())
    repo.record_event(
        player_id=100, departed_at=now - 300, destination="mexico",
        ticket_class="standard", source="torn_api", observed_at=now - 300,
    )
    client = _client(repo, enabled=True, monkeypatch=monkeypatch)
    resp = client.get("/api/flights/active")
    assert resp.status_code == 200
    body = resp.json()
    assert "cached_at" in body
    assert len(body["flights"]) == 1
    flight = body["flights"][0]
    assert flight["player_id"] == 100
    assert flight["destination"] == "mexico"
    # predicted_landed_at = departed_at + 1560 (Mexico standard).
    assert flight["predicted_landed_at"] == (now - 300) + 1560


def test_player_endpoint_returns_current_and_history(repo, monkeypatch):
    now = int(time.time())
    # One completed flight (3 days ago) + one open flight.
    eid_old = repo.record_event(
        player_id=100, departed_at=now - 3 * 86400, destination="uk",
        ticket_class="standard", source="torn_api", observed_at=now - 3 * 86400,
    )
    repo.mark_landed(eid_old, now - 3 * 86400 + 9540)
    repo.record_event(
        player_id=100, departed_at=now - 60, destination="mexico",
        ticket_class="standard", source="torn_api", observed_at=now - 60,
    )

    client = _client(repo, enabled=True, monkeypatch=monkeypatch)
    resp = client.get("/api/flights/100")
    assert resp.status_code == 200
    body = resp.json()
    assert body["current"] is not None
    assert body["current"]["destination"] == "mexico"
    assert "predicted_landed_at" in body["current"]
    # history includes both the completed and the open row, newest first.
    assert len(body["history"]) == 2
    assert body["history"][0]["departed_at"] > body["history"][1]["departed_at"]


def test_player_endpoint_with_no_history_returns_empty(repo, monkeypatch):
    client = _client(repo, enabled=True, monkeypatch=monkeypatch)
    resp = client.get("/api/flights/999")
    assert resp.status_code == 200
    assert resp.json() == {"current": None, "history": []}
