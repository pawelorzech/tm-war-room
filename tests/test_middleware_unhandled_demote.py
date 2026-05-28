"""Middleware-level demote of upstream noise in ``log_requests``.

When a router raises an exception, ``api.main.log_requests`` catches it,
emits one log line, and re-raises. Two problems before this fix:

1. ``logger.error("UNHANDLED ...")`` had no ``exc_info``, so Sentry's
   ``LoggingIntegration`` produced an event with NO exception entry. The
   ``before_send`` hook then could not see the underlying
   ``httpx.HTTPStatusError`` to demote via ``_is_upstream_noise`` — Sentry
   issue PYTHON-FASTAPI-G (``UNHANDLED GET /api/overview ... 504 Gateway
   Timeout``) racked up 17 events that should have been filtered.

2. Even with ``exc_info`` attached, every upstream blip would page Sentry
   at ERROR severity until ``before_send`` ran. Cheaper to log upstream
   noise at WARNING (which ``LoggingIntegration`` does not elevate to a
   Sentry error event) and keep ERROR for real bugs.

These tests pin both behaviours without going through the FastAPI test
client — we call ``log_requests`` directly with a stub ``call_next``,
which is exactly the production code path the middleware decorator wraps.
"""
from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from api.main import log_requests


def _make_request(path: str = "/api/overview", method: str = "GET") -> Any:
    """Minimal Request stand-in — log_requests only touches url.path,
    method and headers."""
    return SimpleNamespace(
        method=method,
        url=SimpleNamespace(path=path),
        headers={"x-player-id": "2362436"},
    )


def _http_status_error(status: int, url: str) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", url)
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError(
        f"Server error '{status}' for url '{request.url}'",
        request=request,
        response=response,
    )


def _raising_call_next(exc: BaseException):
    """Stub ``call_next`` that always raises ``exc`` when awaited."""
    async def _impl(_request):
        raise exc
    return _impl


@pytest.mark.asyncio
async def test_upstream_504_logs_warning_and_propagates(caplog):
    """Issue PYTHON-FASTAPI-G regression: 504 from api.torn.com via
    /api/overview must surface as WARNING (so LoggingIntegration ignores
    it) and still propagate to the caller."""
    exc = _http_status_error(
        504, "https://api.torn.com/v2/faction/?selections=wars"
    )
    call_next = _raising_call_next(exc)
    request = _make_request("/api/overview")

    caplog.set_level(logging.WARNING, logger="tm-hub")

    with pytest.raises(httpx.HTTPStatusError):
        await log_requests(request, call_next)

    upstream_records = [
        r for r in caplog.records
        if r.name == "tm-hub" and r.getMessage().startswith("UPSTREAM")
    ]
    assert upstream_records, "expected one UPSTREAM warning, got none"
    assert upstream_records[0].levelno == logging.WARNING
    # No UNHANDLED error should be emitted for upstream noise.
    assert not any(
        r.getMessage().startswith("UNHANDLED")
        for r in caplog.records if r.name == "tm-hub"
    )


@pytest.mark.asyncio
async def test_upstream_429_logs_warning(caplog):
    """Issues PYTHON-FASTAPI-S/T/Q regression: 429 from api.torn.com must
    be demoted by the middleware too (in addition to the SDK-level
    before_send filter)."""
    exc = _http_status_error(
        429, "https://api.torn.com/v2/faction/crimes?key=xxx"
    )
    call_next = _raising_call_next(exc)
    request = _make_request("/api/overview")

    caplog.set_level(logging.WARNING, logger="tm-hub")

    with pytest.raises(httpx.HTTPStatusError):
        await log_requests(request, call_next)

    assert any(
        r.getMessage().startswith("UPSTREAM") and r.levelno == logging.WARNING
        for r in caplog.records if r.name == "tm-hub"
    )


@pytest.mark.asyncio
async def test_real_bug_logs_error_with_exc_info(caplog):
    """Non-upstream exceptions (real TM Hub bugs) must keep paging Sentry
    at ERROR severity AND attach exc_info so ``before_send`` can inspect
    the underlying exception in the event payload."""
    exc = ValueError("legit TM Hub bug")
    call_next = _raising_call_next(exc)
    request = _make_request("/api/overview")

    caplog.set_level(logging.ERROR, logger="tm-hub")

    with pytest.raises(ValueError):
        await log_requests(request, call_next)

    unhandled = [
        r for r in caplog.records
        if r.name == "tm-hub" and r.getMessage().startswith("UNHANDLED")
    ]
    assert unhandled, "expected one UNHANDLED error, got none"
    record = unhandled[0]
    assert record.levelno == logging.ERROR
    # exc_info is what unlocks the Sentry before_send filter — without it
    # the Sentry event has no exception entry and the upstream-noise
    # check cannot reach the underlying httpx error (issue G's bug).
    assert record.exc_info is not None
    assert record.exc_info[1] is exc


@pytest.mark.asyncio
async def test_non_api_path_skips_middleware(caplog):
    """Sanity: paths outside /api/ bypass the middleware body entirely
    (the production guard) — the request just flows through."""

    async def _ok(_request):
        return SimpleNamespace(status_code=200)

    request = _make_request("/index.html")
    caplog.set_level(logging.DEBUG, logger="tm-hub")
    response = await log_requests(request, _ok)
    assert response.status_code == 200
