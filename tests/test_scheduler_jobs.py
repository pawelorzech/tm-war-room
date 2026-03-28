import os
import pytest
from unittest.mock import AsyncMock
from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository
from api.db.migrations.runner import run_migrations
from api.scheduler.jobs.collect_stats import collect_stat_snapshots
from cryptography.fernet import Fernet

@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(path, migrations_dir)
    return path

@pytest.fixture
def key_repo(db_path):
    key = Fernet.generate_key().decode()
    repo = KeyRepository(db_path, key)
    repo.save_key(player_id=123, player_name="Bombel", api_key="test_key_123")
    return repo

@pytest.fixture
def stats_repo(db_path):
    return StatSnapshotRepository(db_path)

@pytest.mark.asyncio
async def test_collect_stat_snapshots(key_repo, stats_repo):
    mock_client = AsyncMock()
    mock_client.fetch_training_data = AsyncMock(return_value={
        "profile": {"name": "Bombel"},
        "battlestats": {"strength": 1e9, "defense": 8e8, "speed": 5e8, "dexterity": 6e8},
        "personalstats": {"xanax_taken": 5000, "refills": 2000, "energy_drinks": 1000, "networth": 5e9},
        "level": 80,
    })
    await collect_stat_snapshots(key_repo, stats_repo, mock_client)
    snaps = stats_repo.get_snapshots(123)
    assert len(snaps) == 1
    assert snaps[0]["strength"] == 1e9
    assert snaps[0]["defense"] == 8e8
    assert snaps[0]["level"] == 80

@pytest.mark.asyncio
async def test_collect_stats_skips_failed_fetch(key_repo, stats_repo):
    mock_client = AsyncMock()
    mock_client.fetch_training_data = AsyncMock(return_value=None)
    await collect_stat_snapshots(key_repo, stats_repo, mock_client)
    snaps = stats_repo.get_snapshots(123)
    assert len(snaps) == 0
