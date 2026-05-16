"""Smoke tests for FFRepository (Phase 0)."""
import os

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.ff import FFRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return FFRepository(db_path=db_path)


def test_upsert_and_get_roundtrip(repo):
    repo.upsert(player_id=42, score=3.14, dom_stat="strength", source="spy", ttl_seconds=3600, now=1_000_000)
    row = repo.get(42)
    assert row is not None
    assert row["player_id"] == 42
    assert row["score"] == 3.14
    assert row["dom_stat"] == "strength"
    assert row["source"] == "spy"
    assert row["computed_at"] == 1_000_000
    assert row["expires_at"] == 1_000_000 + 3600


def test_get_missing_returns_none(repo):
    assert repo.get(999) is None


def test_upsert_replaces_existing_row(repo):
    repo.upsert(player_id=42, score=1.0, dom_stat="strength", source="formula", ttl_seconds=60, now=100)
    repo.upsert(player_id=42, score=2.5, dom_stat="defense", source="spy", ttl_seconds=120, now=500)
    row = repo.get(42)
    assert row["score"] == 2.5
    assert row["dom_stat"] == "defense"
    assert row["source"] == "spy"
    assert row["computed_at"] == 500
    assert row["expires_at"] == 620


def test_purge_expired_removes_only_stale_rows(repo):
    repo.upsert(player_id=1, score=1.0, dom_stat="total", source="spy", ttl_seconds=10, now=100)
    repo.upsert(player_id=2, score=2.0, dom_stat="total", source="spy", ttl_seconds=1000, now=100)
    # now=200 → player 1 expired (expires_at=110), player 2 still fresh (1100)
    removed = repo.purge_expired(now=200)
    assert removed == 1
    assert repo.get(1) is None
    assert repo.get(2) is not None


def test_check_constraint_rejects_unknown_source(repo):
    import sqlite3

    with pytest.raises(sqlite3.IntegrityError):
        repo.upsert(player_id=1, score=1.0, dom_stat="total", source="oracle", ttl_seconds=60, now=100)
