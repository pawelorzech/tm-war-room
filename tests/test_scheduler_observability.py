"""Contract for the scheduler-job observability wrapper.

Pin: every job entry point captures top-level exceptions to Sentry with the
job name as a tag, and re-raises so APScheduler reports JobOutcome.error.
"""
from __future__ import annotations

import logging
from unittest.mock import patch

import pytest

from api.scheduler.jobs._log_helpers import with_sentry_capture


@pytest.mark.asyncio
async def test_with_sentry_capture_reports_and_reraises(caplog):
    captured: list[tuple[BaseException, dict | None]] = []

    @with_sentry_capture("dummy_job")
    async def bad_job():
        raise RuntimeError("boom")

    with patch(
        "api.scheduler.jobs._log_helpers.capture_exception",
        side_effect=lambda exc, tags=None: captured.append((exc, tags)),
    ):
        with caplog.at_level(logging.ERROR, logger="tm-hub.jobs.dummy_job"):
            with pytest.raises(RuntimeError, match="boom"):
                await bad_job()

    assert len(captured) == 1
    exc, tags = captured[0]
    assert isinstance(exc, RuntimeError)
    assert tags == {"job": "dummy_job"}
    assert any("crashed" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_with_sentry_capture_passes_through_success():
    @with_sentry_capture("dummy_job")
    async def ok_job(x: int) -> int:
        return x * 2

    assert await ok_job(7) == 14


@pytest.mark.asyncio
async def test_collect_company_snapshots_captures_per_element_gather_exception():
    """gather(return_exceptions=True) used to swallow stack traces. Pin that
    each individual exception is now reported with company_id tag."""
    from api.scheduler.jobs import collect_company_snapshots as ccs

    captured: list[tuple[BaseException, dict | None]] = []

    async def fake_snapshot_public(company_id, *_args, **_kwargs):
        if company_id == 999:
            raise RuntimeError(f"public snapshot {company_id} blew up")
        return True

    fake_key_repo = type("R", (), {
        "get_all_keys": lambda self: [{"player_id": 1, "api_key": "k"}],
        "get_faction_key": lambda self: {"api_key": "viewer"},
    })()
    fake_companies_repo = type("C", (), {
        "snapshot_exists_for_director": lambda self, *a, **k: True,
    })()
    fake_tracked_repo = type("T", (), {
        "list_all": lambda self: [
            {"company_id": 100, "name": "good"},
            {"company_id": 999, "name": "bad"},
        ],
    })()

    class FakeTorn:
        async def fetch_company_detailed(self, _key):
            return None  # not a director — skip director loop

    with patch.object(ccs, "_snapshot_public", side_effect=fake_snapshot_public), \
         patch.object(ccs, "capture_exception", side_effect=lambda exc, tags=None: captured.append((exc, tags))):
        await ccs.collect_company_snapshots(
            fake_key_repo, fake_companies_repo, fake_tracked_repo, FakeTorn(),
        )

    assert len(captured) == 1
    exc, tags = captured[0]
    assert isinstance(exc, RuntimeError)
    assert tags == {"job": "collect_company_snapshots", "company_id": 999}


@pytest.mark.asyncio
async def test_discover_companies_captures_per_id_gather_exception():
    from api.scheduler.jobs import discover_companies as dc

    captured: list[tuple[BaseException, dict | None]] = []

    async def fake_probe_one(cid, *_args, **_kwargs):
        if cid == 5:
            raise RuntimeError("probe boom")
        return False

    class FakeTrackedRepo:
        def get_discovery_cursor(self):
            return 0

        def set_discovery_cursor(self, _):
            pass

    class FakeKeyRepo:
        def get_faction_key(self):
            return {"api_key": "viewer"}

        def get_all_keys(self):
            return [{"api_key": "viewer"}]

    class FakeTorn:
        pass

    with patch.object(dc, "_probe_one", side_effect=fake_probe_one), \
         patch.object(dc, "SCAN_BATCH_SIZE", 10), \
         patch.object(dc, "capture_exception", side_effect=lambda exc, tags=None: captured.append((exc, tags))):
        await dc.discover_companies(FakeKeyRepo(), FakeTrackedRepo(), FakeTorn())

    bad = [c for c in captured if c[1] and c[1].get("company_id") == 5]
    assert len(bad) == 1
    assert bad[0][1] == {"job": "discover_companies", "company_id": 5}
