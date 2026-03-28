import pytest
from api.db.repos.base import BaseRepository

@pytest.fixture
def repo(tmp_path):
    return BaseRepository(str(tmp_path / "test.db"))

def test_execute_creates_table_and_queries(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    repo.mutate("INSERT INTO test (id, name) VALUES (?, ?)", (1, "alice"))
    rows = repo.execute("SELECT * FROM test")
    assert len(rows) == 1
    assert rows[0]["id"] == 1
    assert rows[0]["name"] == "alice"

def test_execute_one_returns_single_row(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    repo.mutate("INSERT INTO test (id, name) VALUES (?, ?)", (1, "bob"))
    row = repo.execute_one("SELECT * FROM test WHERE id = ?", (1,))
    assert row is not None
    assert row["name"] == "bob"

def test_execute_one_returns_none_for_no_match(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
    row = repo.execute_one("SELECT * FROM test WHERE id = ?", (999,))
    assert row is None

def test_mutate_returns_lastrowid(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)")
    row_id = repo.mutate("INSERT INTO test (name) VALUES (?)", ("carol",))
    assert row_id == 1
    row_id2 = repo.mutate("INSERT INTO test (name) VALUES (?)", ("dave",))
    assert row_id2 == 2

def test_wal_mode_enabled(repo):
    repo.mutate("CREATE TABLE test (id INTEGER PRIMARY KEY)")
    rows = repo.execute("PRAGMA journal_mode")
    assert rows[0]["journal_mode"] == "wal"
