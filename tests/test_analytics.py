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


def _seed_requests(store):
    """Insert sample data for query tests."""
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 100, 'GET', '/api/overview', 200, 40)")
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 100, 'GET', '/api/overview', 200, 60)")
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms) VALUES (datetime('now'), 200, 'GET', '/api/enemy', 200, 100)")
    conn.execute("INSERT INTO request_log (timestamp, player_id, method, endpoint, status_code, response_time_ms, error_message) VALUES (datetime('now'), 200, 'GET', '/api/enemy', 502, 5000, 'TornStats timeout')")
    conn.commit()
    conn.close()


def test_get_request_stats(store):
    _seed_requests(store)
    stats = store.get_request_stats(days=7)
    assert stats["total_requests"] == 4
    assert len(stats["per_day"]) == 1
    assert len(stats["per_endpoint"]) == 2


def test_get_user_stats(store):
    _seed_requests(store)
    users = store.get_user_stats(days=7)
    assert len(users) == 2
    pids = {u["player_id"] for u in users}
    assert pids == {100, 200}
    user100 = next(u for u in users if u["player_id"] == 100)
    assert user100["request_count"] == 2


def test_get_error_stats(store):
    _seed_requests(store)
    errors = store.get_error_stats(days=7)
    assert len(errors) == 1
    assert errors[0]["endpoint"] == "/api/enemy"
    assert errors[0]["status_code"] == 502
    assert errors[0]["count"] == 1
    assert errors[0]["last_error_message"] == "TornStats timeout"


def test_get_integration_status(store):
    store.log_integration("torn_api", "/v2/faction/members", True, 120.0)
    store.log_integration("yata", "/api/v1/faction/members/", False, 8000.0, "timeout")
    store.log_integration("yata", "/api/v1/faction/members/", True, 200.0)
    status = store.get_integration_status()
    assert status["torn_api"]["status"] == "ok"
    assert status["yata"]["status"] == "ok"  # last call was success


def test_get_integration_status_error(store):
    store.log_integration("tornstats", "/api/v2/spy", True, 300.0)
    store.log_integration("tornstats", "/api/v2/spy", False, 5000.0, "500 Internal Server Error")
    status = store.get_integration_status()
    assert status["tornstats"]["status"] == "error"
    assert status["tornstats"]["last_error"] == "500 Internal Server Error"
