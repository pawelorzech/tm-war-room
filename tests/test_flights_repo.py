"""Smoke tests for FlightRepository (Phase 0)."""
import os

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.flights import FlightRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return FlightRepository(db_path=db_path)


def test_record_event_returns_row_id(repo):
    eid = repo.record_event(
        player_id=100, departed_at=1700000000, destination="UK", ticket_class="standard",
        source="torn_api", observed_at=1700000005,
    )
    assert eid > 0


def test_record_event_appears_in_active_flights(repo):
    repo.record_event(
        player_id=100, departed_at=1700000000, destination="UK", ticket_class="standard",
        source="torn_api", observed_at=1700000005,
    )
    active = repo.active_flights()
    assert len(active) == 1
    assert active[0]["player_id"] == 100
    assert active[0]["destination"] == "UK"
    assert active[0]["ticket_class"] == "standard"
    assert active[0]["landed_at"] is None


def test_mark_landed_clears_from_active(repo):
    eid = repo.record_event(
        player_id=100, departed_at=1700000000, destination="UK", ticket_class="standard",
        source="torn_api", observed_at=1700000005,
    )
    assert repo.mark_landed(event_id=eid, landed_at=1700001000) is True
    assert repo.active_flights() == []


def test_mark_landed_is_idempotent(repo):
    eid = repo.record_event(
        player_id=100, departed_at=1700000000, destination="UK", ticket_class="business",
        source="torn_api", observed_at=1700000005,
    )
    assert repo.mark_landed(event_id=eid, landed_at=1700001000) is True
    # Second call returns False because landed_at IS NOT NULL on the row.
    assert repo.mark_landed(event_id=eid, landed_at=1700002000) is False


def test_flights_for_returns_player_history_newest_first(repo):
    repo.record_event(
        player_id=100, departed_at=1, destination="UK", ticket_class="standard",
        source="torn_api", observed_at=10,
    )
    repo.record_event(
        player_id=100, departed_at=2, destination="HW", ticket_class="business",
        source="torn_api", observed_at=20,
    )
    repo.record_event(
        player_id=200, departed_at=3, destination="MX", ticket_class="wlt",
        source="torn_api", observed_at=30,
    )
    rows = repo.flights_for(player_id=100, limit=10)
    assert len(rows) == 2
    assert rows[0]["destination"] == "HW"
    assert rows[1]["destination"] == "UK"


def test_check_constraint_rejects_unknown_ticket_class(repo):
    import sqlite3

    with pytest.raises(sqlite3.IntegrityError):
        repo.record_event(
            player_id=100, departed_at=1, destination="UK", ticket_class="rocket",
            source="torn_api", observed_at=1,
        )
