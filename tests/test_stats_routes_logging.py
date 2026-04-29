"""Logging contract tests for /api/stats endpoints.

Stats routes used to log nothing — making it impossible to tell from
container output whether 'Stat Growth shows stale data' was caused by
empty DB, missing live-fetch, or a 5xx upstream. These tests pin the
INFO/WARNING lines in place so a future refactor can't quietly drop them.
"""
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from tests.helpers import TEST_JWT_SECRET, auth_headers

AUTH_HEADERS = auth_headers()


@pytest.fixture(autouse=True)
def _patch_jwt_secret():
    with patch("api.main.JWT_SECRET", TEST_JWT_SECRET), \
         patch("api.routers.chat.JWT_SECRET", TEST_JWT_SECRET):
        yield


@pytest.fixture
def mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [
        {"player_id": 123, "player_name": "Test", "api_key": "fake_key", "is_faction_key": False},
    ]
    return store


@pytest.mark.asyncio
async def test_snapshots_route_logs_count_and_freshness(mock_store, caplog):
    from api.routers import stats as stats_mod
    repo = MagicMock()
    repo.get_snapshots.return_value = [
        {"player_id": 123, "snapshot_date": "2026-04-28", "strength": 1e9},
        {"player_id": 123, "snapshot_date": "2026-04-29", "strength": 1.1e9},
    ]
    key_repo = MagicMock(); key_repo.is_admin = MagicMock(return_value=False)

    with patch.object(stats_mod, "stats_repo", repo), \
         patch.object(stats_mod, "key_repo", key_repo), \
         patch("api.main.key_store", mock_store):
        from api.main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with caplog.at_level(logging.INFO, logger="tm-hub.routes.stats"):
                resp = await ac.get("/api/stats/snapshots/123", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    msgs = [r.getMessage() for r in caplog.records if r.name == "tm-hub.routes.stats"]
    assert any("snapshots player=123" in m and "count=2" in m and "newest=2026-04-29" in m for m in msgs), msgs


@pytest.mark.asyncio
async def test_growth_route_logs_baseline_and_latest(mock_store, caplog):
    from api.routers import stats as stats_mod
    repo = MagicMock()
    repo.get_growth.return_value = {
        "player_id": 123,
        "from_date": "2026-03-30",
        "to_date": "2026-04-29",
        "days": 30,
        "growth": {"strength": 1e8, "defense": 0, "speed": 0, "dexterity": 0, "total": 1e8},
        "per_day": {"strength": 1e8 / 30, "defense": 0, "speed": 0, "dexterity": 0, "total": 1e8 / 30},
    }
    key_repo = MagicMock(); key_repo.is_admin = MagicMock(return_value=False)

    with patch.object(stats_mod, "stats_repo", repo), \
         patch.object(stats_mod, "key_repo", key_repo), \
         patch("api.main.key_store", mock_store):
        from api.main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with caplog.at_level(logging.INFO, logger="tm-hub.routes.stats"):
                resp = await ac.get("/api/stats/growth/123?days=30", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    msgs = [r.getMessage() for r in caplog.records if r.name == "tm-hub.routes.stats"]
    assert any("growth player=123" in m and "baseline=2026-03-30" in m and "latest=2026-04-29" in m for m in msgs), msgs


@pytest.mark.asyncio
async def test_leaderboard_warns_when_empty_and_triggers_collect(mock_store, caplog):
    """The 'leaderboard is empty -> ad-hoc collect' branch is the canary that
    proves the scheduler wasn't running. Pin a WARNING on it."""
    from api.routers import stats as stats_mod
    repo = MagicMock()
    # First call: empty (scheduler never ran). Second call: still empty (ad-hoc didn't help).
    repo.get_all_latest = MagicMock(side_effect=[[], []])
    key_repo = MagicMock(); key_repo.is_admin = MagicMock(return_value=False)
    torn_client = AsyncMock()
    torn_client.fetch_members = AsyncMock(return_value=[])

    with patch.object(stats_mod, "stats_repo", repo), \
         patch.object(stats_mod, "key_repo", key_repo), \
         patch.object(stats_mod, "torn_client", torn_client), \
         patch("api.main.key_store", mock_store), \
         patch("api.scheduler.jobs.collect_stats.collect_stat_snapshots", AsyncMock()):
        from api.main import app
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with caplog.at_level(logging.WARNING, logger="tm-hub.routes.stats"):
                resp = await ac.get("/api/stats/leaderboard", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    warns = [r for r in caplog.records if r.levelno >= logging.WARNING and r.name == "tm-hub.routes.stats"]
    assert any("stat_snapshots is empty" in r.getMessage() for r in warns), [r.getMessage() for r in warns]
