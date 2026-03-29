"""Tests for HistoryRepository from api/db/repos/history.py."""
import time
import pytest
from unittest.mock import patch
from api.db.repos.history import HistoryRepository

HISTORY_DDL = """
CREATE TABLE IF NOT EXISTS stock_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    price REAL NOT NULL,
    recorded_at INTEGER NOT NULL,
    UNIQUE(stock_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_stock_history_stock_time ON stock_history(stock_id, recorded_at);

CREATE TABLE IF NOT EXISTS member_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    total_members INTEGER DEFAULT 0,
    online_count INTEGER DEFAULT 0,
    hospital_count INTEGER DEFAULT 0,
    traveling_count INTEGER DEFAULT 0,
    recorded_at INTEGER NOT NULL,
    UNIQUE(snapshot_date)
);
"""


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    r = HistoryRepository(db_path)
    # executescript handles multiple statements; mutate only handles one
    conn = r._conn()
    conn.executescript(HISTORY_DDL)
    conn.close()
    return r


class TestRecordStockPrice:
    def test_record_single_price(self, repo):
        with patch("api.db.repos.history.time") as mock_time:
            mock_time.time.return_value = 1000000
            repo.record_stock_price(stock_id=1, price=100.50)
        history = repo.execute("SELECT * FROM stock_history")
        assert len(history) == 1
        assert history[0]["stock_id"] == 1
        assert history[0]["price"] == 100.50
        assert history[0]["recorded_at"] == 1000000

    def test_record_same_stock_same_timestamp_ignored(self, repo):
        """INSERT OR IGNORE should skip duplicates (same stock_id + recorded_at)."""
        with patch("api.db.repos.history.time") as mock_time:
            mock_time.time.return_value = 1000000
            repo.record_stock_price(stock_id=1, price=100.0)
            repo.record_stock_price(stock_id=1, price=200.0)
        history = repo.execute("SELECT * FROM stock_history")
        assert len(history) == 1
        assert history[0]["price"] == 100.0  # First insert wins

    def test_record_different_timestamps(self, repo):
        with patch("api.db.repos.history.time") as mock_time:
            mock_time.time.return_value = 1000
            repo.record_stock_price(stock_id=1, price=100.0)
            mock_time.time.return_value = 2000
            repo.record_stock_price(stock_id=1, price=105.0)
        history = repo.execute("SELECT * FROM stock_history ORDER BY recorded_at")
        assert len(history) == 2

    def test_record_different_stocks_same_time(self, repo):
        with patch("api.db.repos.history.time") as mock_time:
            mock_time.time.return_value = 1000
            repo.record_stock_price(stock_id=1, price=100.0)
            repo.record_stock_price(stock_id=2, price=50.0)
        history = repo.execute("SELECT * FROM stock_history")
        assert len(history) == 2


class TestRecordStockPricesBulk:
    def test_bulk_insert(self, repo):
        prices = [(1, 100.0), (2, 50.0), (3, 75.0)]
        with patch("api.db.repos.history.time") as mock_time:
            mock_time.time.return_value = 1000
            inserted = repo.record_stock_prices_bulk(prices)
        assert inserted == 3
        history = repo.execute("SELECT * FROM stock_history")
        assert len(history) == 3

    def test_bulk_empty_list(self, repo):
        with patch("api.db.repos.history.time") as mock_time:
            mock_time.time.return_value = 1000
            inserted = repo.record_stock_prices_bulk([])
        assert inserted == 0

    def test_bulk_duplicates_handled(self, repo):
        """Bulk insert with same stock_id at same timestamp should not fail."""
        with patch("api.db.repos.history.time") as mock_time:
            mock_time.time.return_value = 1000
            repo.record_stock_prices_bulk([(1, 100.0)])
            # Insert again at the same timestamp
            inserted = repo.record_stock_prices_bulk([(1, 200.0), (2, 50.0)])
        assert inserted == 2  # Both attempted
        history = repo.execute("SELECT * FROM stock_history")
        assert len(history) == 2  # stock 1 (first), stock 2


class TestGetStockHistory:
    def test_get_history_within_range(self, repo):
        now = int(time.time())
        # Insert prices at known times
        conn = repo._conn()
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 100.0, now - 86400))  # 1 day ago
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 105.0, now - 3600))   # 1 hour ago
        conn.commit()
        conn.close()

        history = repo.get_stock_history(stock_id=1, days=7)
        assert len(history) == 2
        # Ordered by recorded_at ASC
        assert history[0]["price"] == 100.0
        assert history[1]["price"] == 105.0

    def test_get_history_excludes_old_data(self, repo):
        now = int(time.time())
        conn = repo._conn()
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 50.0, now - 86400 * 60))  # 60 days ago
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 100.0, now - 3600))  # 1 hour ago
        conn.commit()
        conn.close()

        history = repo.get_stock_history(stock_id=1, days=30)
        assert len(history) == 1
        assert history[0]["price"] == 100.0

    def test_get_history_filters_by_stock_id(self, repo):
        now = int(time.time())
        conn = repo._conn()
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 100.0, now - 3600))
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (2, 50.0, now - 3600))
        conn.commit()
        conn.close()

        history = repo.get_stock_history(stock_id=1, days=7)
        assert len(history) == 1
        assert history[0]["price"] == 100.0

    def test_get_history_empty(self, repo):
        assert repo.get_stock_history(stock_id=99, days=30) == []

    def test_get_history_returns_dicts(self, repo):
        now = int(time.time())
        conn = repo._conn()
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 100.0, now))
        conn.commit()
        conn.close()
        history = repo.get_stock_history(stock_id=1, days=1)
        assert isinstance(history[0], dict)
        assert "price" in history[0]
        assert "recorded_at" in history[0]


class TestRecordActivitySnapshot:
    def test_record_snapshot(self, repo):
        from datetime import date as real_date
        today = real_date.today().isoformat()
        repo.record_activity_snapshot(total=50, online=20, hospital=5, traveling=3)

        rows = repo.execute("SELECT * FROM member_activity_log")
        assert len(rows) == 1
        r = dict(rows[0])
        assert r["snapshot_date"] == today
        assert r["total_members"] == 50
        assert r["online_count"] == 20
        assert r["hospital_count"] == 5
        assert r["traveling_count"] == 3

    def test_upsert_keeps_max_online(self, repo):
        """ON CONFLICT should keep the MAX online_count."""
        repo.record_activity_snapshot(total=50, online=30, hospital=5, traveling=3)
        repo.record_activity_snapshot(total=50, online=20, hospital=8, traveling=1)

        rows = repo.execute("SELECT * FROM member_activity_log")
        assert len(rows) == 1
        r = dict(rows[0])
        # online_count should be MAX(30, 20) = 30
        assert r["online_count"] == 30
        # Other fields should be latest
        assert r["hospital_count"] == 8
        assert r["traveling_count"] == 1

    def test_different_dates_create_separate_rows(self, repo):
        """Insert rows directly with different dates since date.today() is local import."""
        now = int(time.time())
        conn = repo._conn()
        conn.execute("""INSERT INTO member_activity_log
            (snapshot_date, total_members, online_count, hospital_count, traveling_count, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?)""", ("2026-03-27", 50, 20, 5, 3, now))
        conn.execute("""INSERT INTO member_activity_log
            (snapshot_date, total_members, online_count, hospital_count, traveling_count, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?)""", ("2026-03-28", 52, 25, 3, 2, now))
        conn.commit()
        conn.close()

        rows = repo.execute("SELECT * FROM member_activity_log")
        assert len(rows) == 2


class TestGetActivityHistory:
    def test_get_activity_history(self, repo):
        conn = repo._conn()
        conn.execute("""INSERT INTO member_activity_log
            (snapshot_date, total_members, online_count, hospital_count, traveling_count, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?)""", ("2026-03-27", 50, 20, 5, 3, 1000))
        conn.execute("""INSERT INTO member_activity_log
            (snapshot_date, total_members, online_count, hospital_count, traveling_count, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?)""", ("2026-03-28", 52, 25, 3, 2, 2000))
        conn.commit()
        conn.close()

        history = repo.get_activity_history(days=30)
        assert len(history) == 2
        # Ordered by snapshot_date DESC
        assert history[0]["snapshot_date"] == "2026-03-28"
        assert history[1]["snapshot_date"] == "2026-03-27"


class TestCleanupOldData:
    def test_cleanup_removes_old_stock_data(self, repo):
        now = int(time.time())
        conn = repo._conn()
        # Old record: 100 days ago
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 50.0, now - 86400 * 100))
        # Recent record: 10 days ago
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 100.0, now - 86400 * 10))
        conn.commit()
        conn.close()

        deleted = repo.cleanup_old_data(days=90)
        assert deleted == 1
        remaining = repo.execute("SELECT * FROM stock_history")
        assert len(remaining) == 1
        assert remaining[0]["price"] == 100.0

    def test_cleanup_no_old_data(self, repo):
        now = int(time.time())
        conn = repo._conn()
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 100.0, now - 3600))
        conn.commit()
        conn.close()

        deleted = repo.cleanup_old_data(days=90)
        assert deleted == 0

    def test_cleanup_empty_table(self, repo):
        deleted = repo.cleanup_old_data(days=90)
        assert deleted == 0

    def test_cleanup_custom_days(self, repo):
        now = int(time.time())
        conn = repo._conn()
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (1, 50.0, now - 86400 * 35))  # 35 days ago
        conn.execute("INSERT INTO stock_history (stock_id, price, recorded_at) VALUES (?, ?, ?)",
                     (2, 100.0, now - 86400 * 10))  # 10 days ago
        conn.commit()
        conn.close()

        deleted = repo.cleanup_old_data(days=30)
        assert deleted == 1
        remaining = repo.execute("SELECT * FROM stock_history")
        assert len(remaining) == 1
        assert remaining[0]["stock_id"] == 2
