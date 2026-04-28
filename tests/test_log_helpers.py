import logging

import httpx
import pytest

from api.scheduler.jobs._log_helpers import log_job_error


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
