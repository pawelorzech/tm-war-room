import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.spies import SpyRepository
from api.scheduler.jobs.refresh_stale_spies import (
    refresh_stale_estimates,
    STALE_THRESHOLD_DAYS,
)
from api.services.spy import SpyService


@pytest.fixture(autouse=True)
def _no_pacing(monkeypatch):
    """Production code sleeps 0.5s between TornStats calls; tests shouldn't wait."""
    async def _instant(*_a, **_k):
        return None
    monkeypatch.setattr(
        "api.scheduler.jobs.refresh_stale_spies.asyncio.sleep", _instant
    )


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(path, migrations_dir)
    return path


@pytest.fixture
def service(db_path):
    return SpyService(SpyRepository(db_path))


def _days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def _seed_estimate(service: SpyService, player_id: int, age_days: int, source: str = "tornstats") -> None:
    """Insert a report at the given age and run refresh_estimate to populate spy_estimates."""
    service.repo.upsert_report(
        player_id=player_id, player_name=f"P{player_id}", source=source,
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        confidence="estimate", reported_at=_days_ago(age_days),
    )
    service.refresh_estimate(player_id)


def _make_ts_response(total: float = 5e9) -> dict:
    return {
        "player_name": "Refreshed",
        "strength": total / 4, "defense": total / 4,
        "speed": total / 4, "dexterity": total / 4,
        "total": total,
    }


async def test_no_key_skips(service):
    """Empty tornstats_key → never call torn_client."""
    _seed_estimate(service, 1, age_days=30)
    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock()

    result = await refresh_stale_estimates(service, torn, tornstats_key="")

    torn.fetch_tornstats_spy_user.assert_not_called()
    assert result == {"refreshed": 0, "attempted": 0}


async def test_no_stale_returns_early(service):
    """All estimates fresh → no fetches."""
    _seed_estimate(service, 1, age_days=2)  # within threshold
    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock()

    result = await refresh_stale_estimates(service, torn, tornstats_key="k", max_per_run=10)

    torn.fetch_tornstats_spy_user.assert_not_called()
    assert result == {"refreshed": 0, "attempted": 0}


async def test_refreshes_oldest_first(service):
    """With 5 stale + max_per_run=3, picks the 3 oldest in ASC order."""
    # Ages: 50, 40, 30, 20, 10 — all >7d threshold
    for pid, age in [(1, 50), (2, 40), (3, 30), (4, 20), (5, 10)]:
        _seed_estimate(service, pid, age_days=age)
    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock(return_value=_make_ts_response())

    await refresh_stale_estimates(service, torn, tornstats_key="k", max_per_run=3)

    # Should refresh player_id 1, 2, 3 (the three oldest)
    called_ids = [c.args[0] for c in torn.fetch_tornstats_spy_user.call_args_list]
    assert called_ids == [1, 2, 3]


async def test_per_player_error_isolation(service):
    """Exception fetching player A must not block players B and C."""
    _seed_estimate(service, 1, age_days=30)
    _seed_estimate(service, 2, age_days=20)
    _seed_estimate(service, 3, age_days=10)

    def side_effect(player_id, key):
        if player_id == 2:
            raise RuntimeError("simulated TornStats outage")
        return _make_ts_response()

    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock(side_effect=side_effect)

    await refresh_stale_estimates(service, torn, tornstats_key="k", max_per_run=10)

    assert torn.fetch_tornstats_spy_user.await_count == 3
    # Player 1 and 3 should have fresh TornStats reports; player 2 keeps the old one
    reports_1 = service.repo.get_reports(1)
    reports_3 = service.repo.get_reports(3)
    assert any(r["total"] == 5e9 for r in reports_1)
    assert any(r["total"] == 5e9 for r in reports_3)


async def test_zero_total_skipped(service):
    """TornStats returning total=0 means it has no spy data → don't upsert garbage."""
    _seed_estimate(service, 1, age_days=30)
    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock(return_value={"total": 0, "strength": 0, "defense": 0, "speed": 0, "dexterity": 0})

    await refresh_stale_estimates(service, torn, tornstats_key="k", max_per_run=10)

    # Only the original seeded report remains (total=4e9), no new one written
    reports = service.repo.get_reports(1)
    assert all(r["total"] == 4e9 for r in reports)


async def test_writes_with_correct_source_and_confidence(service):
    """Fresh report goes in as source=tornstats / confidence=estimate."""
    _seed_estimate(service, 1, age_days=30)
    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock(return_value=_make_ts_response(total=8e9))

    result = await refresh_stale_estimates(service, torn, tornstats_key="k", max_per_run=10)
    assert result == {"refreshed": 1, "attempted": 1}

    reports = service.repo.get_reports(1)
    fresh = [r for r in reports if r["total"] == 8e9]
    assert len(fresh) == 1
    assert fresh[0]["source"] == "tornstats"
    assert fresh[0]["confidence"] == "estimate"
    # And the estimate should now reflect the fresh data
    est = service.repo.get_estimate(1)
    assert est["total"] == 8e9
    assert est["confidence"] == "estimate"  # within 30d


async def test_none_response_skipped(service):
    """TornStats returning None (e.g. status=false) → don't crash, don't upsert."""
    _seed_estimate(service, 1, age_days=30)
    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock(return_value=None)

    await refresh_stale_estimates(service, torn, tornstats_key="k", max_per_run=10)

    reports = service.repo.get_reports(1)
    assert all(r["total"] == 4e9 for r in reports)


async def test_respects_stale_threshold(service):
    """Only rows older than STALE_THRESHOLD_DAYS get refreshed."""
    _seed_estimate(service, 1, age_days=STALE_THRESHOLD_DAYS + 1)  # stale
    _seed_estimate(service, 2, age_days=STALE_THRESHOLD_DAYS - 1)  # fresh
    torn = MagicMock()
    torn.fetch_tornstats_spy_user = AsyncMock(return_value=_make_ts_response())

    await refresh_stale_estimates(service, torn, tornstats_key="k", max_per_run=10)

    called_ids = [c.args[0] for c in torn.fetch_tornstats_spy_user.call_args_list]
    assert called_ids == [1]
