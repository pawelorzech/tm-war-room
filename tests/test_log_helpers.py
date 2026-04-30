import logging
from unittest.mock import MagicMock

import httpx
import pytest

from api.scheduler.jobs import _log_helpers
from api.scheduler.jobs._log_helpers import log_job_error, report_job_error


def _make_status_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://api.torn.com/v2/faction")
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


def test_5xx_demoted_to_warning(caplog):
    logger = logging.getLogger("tm-hub.test.log_helpers.5xx")
    with caplog.at_level(logging.WARNING, logger=logger.name):
        log_job_error(logger, "upstream call failed: %s", _make_status_error(504))
    levels = [r.levelno for r in caplog.records if r.name == logger.name]
    assert logging.WARNING in levels
    assert logging.ERROR not in levels


def test_4xx_kept_as_error(caplog):
    logger = logging.getLogger("tm-hub.test.log_helpers.4xx")
    with caplog.at_level(logging.WARNING, logger=logger.name):
        log_job_error(logger, "upstream call failed: %s", _make_status_error(403))
    assert any(r.levelno == logging.ERROR for r in caplog.records if r.name == logger.name)


def test_timeout_demoted_to_warning(caplog):
    logger = logging.getLogger("tm-hub.test.log_helpers.timeout")
    with caplog.at_level(logging.WARNING, logger=logger.name):
        log_job_error(logger, "upstream call failed: %s", httpx.ReadTimeout("slow"))
    assert any(r.levelno == logging.WARNING for r in caplog.records if r.name == logger.name)
    assert not any(r.levelno == logging.ERROR for r in caplog.records if r.name == logger.name)


def test_unknown_exception_kept_as_error(caplog):
    logger = logging.getLogger("tm-hub.test.log_helpers.unknown")
    with caplog.at_level(logging.WARNING, logger=logger.name):
        log_job_error(logger, "upstream call failed: %s", ValueError("bad data"))
    assert any(r.levelno == logging.ERROR for r in caplog.records if r.name == logger.name)


# ---------------------------------------------------------------------------
# report_job_error: Sentry-aware variant
# ---------------------------------------------------------------------------
#
# The bug we're pinning: Sentry's default LoggingIntegration turns every
# logger.error into a Sentry issue (event_level=ERROR by default). Upstream
# Torn API noise (504s, timeouts, connect resets) is not a bug — it MUST be
# demoted to logger.warning so the integration ignores it AND must not call
# capture_exception directly. Genuine bugs still go to logger.error AND
# capture_exception with the right tags.


@pytest.fixture
def fake_capture(monkeypatch):
    cap = MagicMock()
    monkeypatch.setattr(_log_helpers, "capture_exception", cap)
    return cap


@pytest.fixture
def fake_logger():
    return MagicMock(spec=logging.Logger)


def test_report_504_is_demoted_and_not_captured(fake_capture, fake_logger):
    exc = _make_status_error(504)
    report_job_error(fake_logger, "loot failed: %s", exc, job="refresh_data:loot")

    fake_logger.warning.assert_called_once_with("loot failed: %s", exc)
    fake_logger.error.assert_not_called()
    fake_capture.assert_not_called()


def test_report_500_is_demoted_and_not_captured(fake_capture, fake_logger):
    exc = _make_status_error(500)
    report_job_error(fake_logger, "x: %s", exc, job="refresh_data:attack")

    fake_logger.warning.assert_called_once()
    fake_capture.assert_not_called()


def test_report_timeout_is_demoted_and_not_captured(fake_capture, fake_logger):
    exc = httpx.TimeoutException("read timeout")
    report_job_error(fake_logger, "timeout: %s", exc, job="refresh_spies")

    fake_logger.warning.assert_called_once_with("timeout: %s", exc)
    fake_capture.assert_not_called()


def test_report_connect_error_is_demoted_and_not_captured(fake_capture, fake_logger):
    exc = httpx.ConnectError("dns failed")
    report_job_error(fake_logger, "connect: %s", exc, job="refresh_data:stock")

    fake_logger.warning.assert_called_once()
    fake_capture.assert_not_called()


def test_report_read_error_is_demoted_and_not_captured(fake_capture, fake_logger):
    exc = httpx.ReadError("read failure")
    report_job_error(fake_logger, "read: %s", exc, job="refresh_data:bars")

    fake_logger.warning.assert_called_once()
    fake_capture.assert_not_called()


def test_report_4xx_is_real_error_and_captured(fake_capture, fake_logger):
    """4xx is NOT upstream noise — bad request from us, real bug."""
    exc = _make_status_error(400)
    report_job_error(fake_logger, "boom: %s", exc, job="refresh_data:loot")

    fake_logger.error.assert_called_once()
    fake_logger.warning.assert_not_called()
    fake_capture.assert_called_once()
    args, kwargs = fake_capture.call_args
    assert args[0] is exc
    assert kwargs["tags"] == {"job": "refresh_data:loot"}


def test_report_value_error_is_captured_with_job_tag(fake_capture, fake_logger):
    exc = ValueError("boom")
    report_job_error(fake_logger, "bug: %s", exc, job="collect_stats")

    fake_logger.error.assert_called_once()
    # exc_info must be threaded through so we keep the stack trace.
    _, kwargs = fake_logger.error.call_args
    assert kwargs.get("exc_info") is exc
    fake_capture.assert_called_once()
    args, kwargs = fake_capture.call_args
    assert args[0] is exc
    assert kwargs["tags"] == {"job": "collect_stats"}


def test_report_extra_tags_are_merged_with_job(fake_capture, fake_logger):
    exc = RuntimeError("explode")
    report_job_error(
        fake_logger,
        "bug: %s",
        exc,
        job="collect_stats",
        extra_tags={"player_id": 123},
    )

    fake_capture.assert_called_once()
    _, kwargs = fake_capture.call_args
    assert kwargs["tags"] == {"job": "collect_stats", "player_id": 123}


def test_report_extra_tags_none_still_includes_job(fake_capture, fake_logger):
    exc = RuntimeError("explode")
    report_job_error(fake_logger, "bug: %s", exc, job="refresh_spies")

    _, kwargs = fake_capture.call_args
    assert kwargs["tags"] == {"job": "refresh_spies"}
