"""Scheduler-job tests for run_flights_tick.

We exercise the full depart → land → classify cycle against a real
``FlightRepository`` (sqlite tmp file) and a mocked TornClient. The
``run_flights_tick`` entry point reads its dependencies from
``api.scheduler.engine._state``, so the tests inject through
``api.scheduler.engine._state`` directly and reset it between tests.
"""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.flights import FlightRepository
from api.scheduler.jobs import flights as flights_job


@pytest.fixture
def flight_repo(tmp_path):
    db_path = str(tmp_path / "flights.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return FlightRepository(db_path=db_path)


@pytest.fixture
def fake_state(flight_repo, monkeypatch):
    """Install a minimal engine state with one tracked faction member."""
    key_repo = MagicMock()
    key_repo.get_all_player_ids_with_keys.return_value = [(100, b"enc")]

    war_obj = MagicMock()
    war_obj.factions = []  # no war → no enemy fan-out

    torn_client = MagicMock()
    torn_client.fetch_war = AsyncMock(return_value=war_obj)
    torn_client.fetch_enemy_members = AsyncMock(return_value=[])
    # `fetch_user_profile_stats` is what the job actually polls per player.
    torn_client.fetch_user_profile_stats = AsyncMock(return_value=None)

    state = {
        "key_repo": key_repo,
        "torn_client": torn_client,
        "flight_repo": flight_repo,
        "faction_id": 11559,
    }
    from api.scheduler import engine

    monkeypatch.setattr(engine, "_state", state)
    # Reset in-memory edge detector + stale-sweep cadence between tests so
    # each test starts from a clean transition baseline.
    flights_job._last_status.clear()
    monkeypatch.setattr(flights_job, "_last_stale_sweep", 0.0)
    return state, torn_client


@pytest.mark.asyncio
async def test_no_change_no_row(fake_state, flight_repo):
    _, torn_client = fake_state
    torn_client.fetch_user_profile_stats = AsyncMock(return_value={
        "status_state": "Okay", "status_description": "Okay",
    })

    await flights_job.run_flights_tick()
    assert flight_repo.active_flights() == []


@pytest.mark.asyncio
async def test_departure_opens_row(fake_state, flight_repo, monkeypatch):
    _, torn_client = fake_state

    # First tick: Okay (no row created — baseline is Okay).
    torn_client.fetch_user_profile_stats = AsyncMock(return_value={
        "status_state": "Okay", "status_description": "Okay",
    })
    await flights_job.run_flights_tick()
    assert flight_repo.active_flights() == []

    # Second tick: now Traveling to Mexico — row opens.
    torn_client.fetch_user_profile_stats = AsyncMock(return_value={
        "status_state": "Traveling", "status_description": "Traveling to Mexico",
    })
    await flights_job.run_flights_tick()
    active = flight_repo.active_flights()
    assert len(active) == 1
    assert active[0]["player_id"] == 100
    assert active[0]["destination"] == "mexico"
    assert active[0]["ticket_class"] == "standard"  # speculative — refined on landing
    assert active[0]["landed_at"] is None


@pytest.mark.asyncio
async def test_landing_classifies_ticket_class(fake_state, flight_repo, monkeypatch):
    """Depart → 780 s elapse → land. Expected classification: business."""
    _, torn_client = fake_state

    # t = 1_000_000 — first observation: Okay.
    monkeypatch.setattr(flights_job.time, "time", lambda: 1_000_000)
    torn_client.fetch_user_profile_stats = AsyncMock(return_value={
        "status_state": "Okay", "status_description": "Okay",
    })
    await flights_job.run_flights_tick()

    # t = 1_000_060 — departure to Mexico.
    monkeypatch.setattr(flights_job.time, "time", lambda: 1_000_060)
    torn_client.fetch_user_profile_stats = AsyncMock(return_value={
        "status_state": "Traveling", "status_description": "Traveling to Mexico",
    })
    await flights_job.run_flights_tick()
    open_row = flight_repo.most_recent_open(100)
    assert open_row is not None
    assert open_row["destination"] == "mexico"

    # t = 1_000_060 + 780 — landing (business duration for Mexico).
    monkeypatch.setattr(flights_job.time, "time", lambda: 1_000_060 + 780)
    torn_client.fetch_user_profile_stats = AsyncMock(return_value={
        "status_state": "Okay", "status_description": "Okay",
    })
    await flights_job.run_flights_tick()

    assert flight_repo.active_flights() == []
    history = flight_repo.flights_for(100, limit=5)
    assert len(history) == 1
    assert history[0]["ticket_class"] == "business"
    assert history[0]["landed_at"] == 1_000_060 + 780


@pytest.mark.asyncio
async def test_landing_without_prior_row_is_no_op(fake_state, flight_repo, monkeypatch):
    """If the worker missed the departure (e.g. restarted mid-flight), a
    Traveling→Okay transition must not crash — just log and move on."""
    _, torn_client = fake_state
    # Seed the edge detector so the first tick sees a Traveling→Okay edge
    # without any matching open row.
    flights_job._last_status[100] = "Traveling"
    torn_client.fetch_user_profile_stats = AsyncMock(return_value={
        "status_state": "Okay", "status_description": "Okay",
    })

    await flights_job.run_flights_tick()
    # No open row, no history row — we don't fabricate a flight.
    assert flight_repo.active_flights() == []
    assert flight_repo.flights_for(100, limit=5) == []


@pytest.mark.asyncio
async def test_missing_dependencies_returns_silently(monkeypatch):
    """No torn_client / no flight_repo → early return, no exception."""
    from api.scheduler import engine

    monkeypatch.setattr(engine, "_state", {})
    flights_job._last_status.clear()
    # Should not raise.
    await flights_job.run_flights_tick()


@pytest.mark.asyncio
async def test_per_player_failure_does_not_abort_tick(fake_state, flight_repo, monkeypatch):
    """If fetch_user_profile_stats fails for one player, the tick logs a
    failure for that player and moves on; the in-memory state stays
    consistent for the next tick."""
    state, torn_client = fake_state
    # Two players in the tracked set.
    state["key_repo"].get_all_player_ids_with_keys.return_value = [(100, b"e"), (200, b"e")]

    async def selective(pid):
        if pid == 100:
            raise RuntimeError("Torn upstream 504")
        return {"status_state": "Traveling", "status_description": "Traveling to Mexico"}

    torn_client.fetch_user_profile_stats = AsyncMock(side_effect=selective)
    await flights_job.run_flights_tick()

    # Player 200 got their row despite player 100's failure.
    active = flight_repo.active_flights()
    assert {r["player_id"] for r in active} == {200}
