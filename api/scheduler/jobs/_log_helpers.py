"""Shared logging helpers for scheduler jobs.

Upstream Torn API hiccups (504 Gateway Timeout, transient connection errors)
are already handled by the scheduler's per-job try/except + retry-on-next-cycle
loop. We don't want them flooding Sentry as `error` events — demote them to
`warning` so they remain breadcrumbs, while keeping `error` for genuinely
unexpected exception types that DO indicate a bug.
"""
from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Awaitable, Callable, TypeVar

import httpx

from api.observability import capture_exception


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


F = TypeVar("F", bound=Callable[..., Awaitable[Any]])


def with_sentry_capture(job_name: str) -> Callable[[F], F]:
    """Wrap an async scheduler entry point: log exception + report to Sentry, then re-raise.

    Re-raising is intentional — APScheduler reports `JobOutcome.error` so the
    health endpoint can see it. Filtering of expected upstream Torn 5xx errors
    happens via `before_send` / `log_job_error` semantics elsewhere.
    """
    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as exc:
                logging.getLogger(f"tm-hub.jobs.{job_name}").exception("job %s crashed", job_name)
                capture_exception(exc, tags={"job": job_name})
                raise
        return wrapper  # type: ignore[return-value]
    return decorator
