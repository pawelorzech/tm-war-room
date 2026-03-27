import pytest
from app.analytics import AnalyticsStore


@pytest.fixture
def store(tmp_path):
    return AnalyticsStore(db_path=str(tmp_path / "test_analytics.db"))


def test_init_creates_tables(store):
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    conn.close()
    names = {t[0] for t in tables}
    assert "request_log" in names
    assert "integration_log" in names


def test_log_request(store):
    store.log_request(player_id=123, method="GET", endpoint="/api/overview", status_code=200, response_time_ms=45.2)
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    rows = conn.execute("SELECT player_id, method, endpoint, status_code, response_time_ms FROM request_log").fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0] == (123, "GET", "/api/overview", 200, 45.2)


def test_log_request_no_player(store):
    store.log_request(player_id=None, method="POST", endpoint="/api/keys", status_code=200, response_time_ms=100.0)
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    rows = conn.execute("SELECT player_id FROM request_log").fetchall()
    conn.close()
    assert rows[0][0] is None


def test_log_integration(store):
    store.log_integration(service="torn_api", endpoint="/v2/faction/members", success=True, response_time_ms=120.5)
    store.log_integration(service="yata", endpoint="/api/v1/faction/members/", success=False, response_time_ms=8000.0, error_message="timeout")
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    rows = conn.execute("SELECT service, success, error_message FROM integration_log ORDER BY id").fetchall()
    conn.close()
    assert len(rows) == 2
    assert rows[0] == ("torn_api", 1, None)
    assert rows[1] == ("yata", 0, "timeout")


def test_cleanup(store):
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now', '-40 days'), 1, 'GET', '/api/overview', 200, 50)")
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 2, 'GET', '/api/overview', 200, 50)")
    conn.execute("INSERT INTO integration_log (timestamp, service, endpoint, success, response_time_ms) VALUES (datetime('now', '-40 days'), 'torn_api', '/test', 1, 50)")
    conn.commit()
    conn.close()
    store.cleanup(days=30)
    conn = sqlite3.connect(store._db_path)
    req_count = conn.execute("SELECT COUNT(*) FROM request_log").fetchone()[0]
    int_count = conn.execute("SELECT COUNT(*) FROM integration_log").fetchone()[0]
    conn.close()
    assert req_count == 1
    assert int_count == 0
