"""Tests for MugRepository from api/db/repos/mug.py."""
import pytest
from api.db.repos.mug import MugRepository

DDL = """
CREATE TABLE IF NOT EXISTS mug_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_player_id INTEGER NOT NULL,
    target_player_id INTEGER NOT NULL,
    mugged_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recent_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_player_id INTEGER NOT NULL,
    seller_player_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'trade',
    source TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);
"""


@pytest.fixture
def repo(tmp_path):
    r = MugRepository(str(tmp_path / "test.db"))
    for stmt in DDL.strip().split(";"):
        if stmt.strip():
            r.mutate(stmt)
    return r


class TestMugLog:
    def test_log_and_lookup_last_mug(self, repo):
        repo.log_mug(owner_player_id=1, target_player_id=100, mugged_at=1000)
        repo.log_mug(owner_player_id=1, target_player_id=100, mugged_at=2000)
        assert repo.last_mug_at(1, 100) == 2000

    def test_last_mug_none_when_absent(self, repo):
        assert repo.last_mug_at(1, 999) is None

    def test_last_mug_scoped_by_owner(self, repo):
        repo.log_mug(owner_player_id=1, target_player_id=100, mugged_at=1000)
        assert repo.last_mug_at(2, 100) is None


class TestTrades:
    def test_add_and_lookup_last_trade(self, repo):
        repo.add_trade(owner_player_id=1, seller_player_id=100, kind="trade", source="imarket", created_at=5000)
        assert repo.last_trade_at(1, 100) == 5000

    def test_last_trade_none_when_absent(self, repo):
        assert repo.last_trade_at(1, 999) is None
