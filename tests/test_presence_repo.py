import os
import time
import pytest
import sqlite3
from api.db.repos.presence_repository import PresenceRepository
from api.db.migrations.runner import run_migrations


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return PresenceRepository(db_path)


def test_get_online_empty(repo):
    assert repo.get_online(ttl_seconds=120) == []


def test_heartbeat_adds_player(repo):
    repo.heartbeat(42)
    online = repo.get_online(ttl_seconds=120)
    assert 42 in online


def test_heartbeat_updates_existing(repo):
    repo.heartbeat(42)
    repo.heartbeat(42)
    online = repo.get_online(ttl_seconds=120)
    assert online.count(42) == 1


def test_get_online_excludes_stale(repo):
    conn = sqlite3.connect(repo._db_path)
    conn.execute(
        "INSERT INTO player_presence (player_id, last_seen) VALUES (?, ?)",
        (99, int(time.time()) - 300),
    )
    conn.commit()
    conn.close()
    online = repo.get_online(ttl_seconds=120)
    assert 99 not in online
