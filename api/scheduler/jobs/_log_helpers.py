"""Shared logging helpers for scheduler jobs.

Upstream Torn API hiccups (504 Gateway Timeout, transient connection errors)
are already handled by the scheduler's per-job try/except + retry-on-next-cycle
loop. We don't want them flooding Sentry as `error` events — demote them to
`warning` so they remain breadcrumbs, while keeping `error` for genuinely
unexpected exception types that DO indicate a bug.
"""
from __future__ import annotations

import logging

import httpx


def log_job_error(logger: logging.Logger, msg: str, exc: BaseException) -> None:
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if 500 <= status < 600:
            logger.warning(msg, exc)
            return
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        logger.warning(msg, exc)
        return
    logger.error(msg, exc)
