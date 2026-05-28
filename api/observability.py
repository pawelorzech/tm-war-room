"""Sentry/Glitchtip integration for TM Hub (Sprint 2 #13).

Glitchtip is Sentry-API-compatible, so we use the official ``sentry_sdk``.
The DSN is read from ``SENTRY_DSN`` env var. When unset (dev/test/local), the
SDK is not initialised and every helper is a no-op — so this module never
breaks a deployment that's missing the env.

PII filter (CRITICAL — Torn API keys must NEVER leave the box):
    * ``before_send`` / ``before_send_transaction`` walk the entire event
      payload and scrub:
        - any value matching the Torn API key pattern (16 alphanumerics)
        - any query string param literally named ``key``
        - the ``Authorization`` header
        - any cookie header (might carry tm_session)
        - any field named ``api_key`` / ``key`` / ``token`` / ``password``
    * Tested explicitly in ``tests/test_observability.py`` so a regression
      can't slip past CI.

Usage from main.py lifespan:
    from api.observability import init_sentry
    init_sentry()
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger("tm-hub.observability")

# Torn API keys are 16-char alphanumerics. We use a strict regex so generic
# UUIDs / hashes don't get masked by accident.
_TORN_KEY_RE = re.compile(r"\b[a-zA-Z0-9]{16}\b")
# Header / param / field names whose VALUE we should always scrub regardless of
# content. Compared case-insensitively.
_SECRET_FIELD_NAMES = {
    "key",
    "api_key",
    "apikey",
    "token",
    "password",
    "secret",
    "authorization",
    "cookie",
    "set-cookie",
    "x-mcp-token",
    "tornstats_api_key",
    "encryption_key",
    "jwt_secret",
    "backup_encryption_key",
}
_REDACTED = "[Filtered]"


def _scrub_value(value: Any) -> Any:
    """Recursively scrub Torn-key-shaped strings out of any structure."""
    if isinstance(value, str):
        return _TORN_KEY_RE.sub(_REDACTED, value)
    if isinstance(value, dict):
        return {k: _scrub_dict_value(k, v) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub_value(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_scrub_value(v) for v in value)
    return value


def _scrub_dict_value(key: Any, value: Any) -> Any:
    """If the dict key matches a known-secret name, redact the whole value;
    otherwise recurse normally."""
    if isinstance(key, str) and key.lower() in _SECRET_FIELD_NAMES:
        return _REDACTED
    return _scrub_value(value)


_TORNSTATS_HOSTS = {"www.tornstats.com", "tornstats.com"}


def _is_upstream_noise(exc: BaseException) -> bool:
    """True for transient upstream failures we don't want as Sentry errors.

    Covers four flavours of "not our bug":
      * ``httpx.HTTPStatusError`` with 5xx from anywhere — upstream server
        crashed/overloaded.
      * ``httpx.HTTPStatusError`` with 429 from anywhere — pure rate-limit
        signal ("back off"), never a TM Hub bug regardless of which upstream
        throttled us (api.torn.com, tornstats, anything else).
      * ``httpx.HTTPStatusError`` with other 4xx from ``(www.)tornstats.com`` —
        TornStats' API surface is flaky (4xx for expired user keys, removed
        endpoints, data-shape changes); not actionable on our side. We
        deliberately keep non-429 4xx from ``api.torn.com`` as real errors so
        TM Hub bugs (bad selections, key handling) still page Sentry.
      * ``httpx.TimeoutException`` / ``ConnectError`` / ``ReadError`` —
        network blip to any upstream.

    Single source of truth — also imported by
    ``api/scheduler/jobs/_log_helpers.py`` for the scheduler's per-job demote
    logic. The AsyncioIntegration patches the asyncio task factory and
    captures EVERY task exception, so per-call demote logic in scheduler jobs
    is bypassed. Filtering here in ``before_send`` catches any
    integration-level capture path without touching individual job files.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if 500 <= status < 600:
            return True
        if 400 <= status < 500:
            # 429 = rate limit, "back off" — never our bug, regardless of host.
            if status == 429:
                return True
            # Demote remaining 4xx only for known-flaky hosts (currently tornstats).
            # Defensive: if request/url is missing, fall through.
            try:
                host = exc.request.url.host
            except (AttributeError, TypeError):
                host = None
            if host and host.lower() in _TORNSTATS_HOSTS:
                return True
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        return True
    return False


def _before_send(event: dict, hint: dict | None) -> dict | None:
    """Sentry SDK hook: drop upstream noise + scrub PII before transmitting any event."""
    # Drop upstream Torn API noise (httpx 5xx, timeouts, connect/read errors)
    # before anything else. AsyncioIntegration captures these from
    # asyncio.gather tasks even when the outer code handles them via
    # `return_exceptions=True`, so the only reliable place to filter is here.
    exc_info = (hint or {}).get("exc_info")
    if exc_info:
        exc = exc_info[1] if len(exc_info) >= 2 else None
        if exc is not None and _is_upstream_noise(exc):
            return None
    try:
        return _scrub_value(event)
    except Exception as e:
        # Never let scrubbing fail open. If it explodes, drop the event so a
        # PII leak is impossible.
        logger.warning("Sentry PII scrub failed (%s) — dropping event.", e)
        return None


def _before_send_transaction(event: dict, _hint: dict) -> dict | None:
    """Same scrubbing applied to performance/trace transactions."""
    return _before_send(event, _hint)


def init_sentry() -> bool:
    """Initialise Sentry SDK if SENTRY_DSN is set. Returns True iff initialised."""
    dsn = os.environ.get("SENTRY_DSN") or ""
    if not dsn:
        logger.info("SENTRY_DSN not set — Sentry/Glitchtip integration disabled.")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.asyncio import AsyncioIntegration
    except ImportError:
        logger.warning("sentry_sdk not installed — observability disabled.")
        return False

    env = os.environ.get("APP_VERSION", "dev")
    sentry_sdk.init(
        dsn=dsn,
        environment="production" if env != "dev" else "dev",
        release=env,
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        profiles_sample_rate=0.0,  # Glitchtip doesn't yet support profiling
        send_default_pii=False,
        attach_stacktrace=True,
        max_breadcrumbs=50,
        before_send=_before_send,
        before_send_transaction=_before_send_transaction,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            AsyncioIntegration(),
        ],
    )
    logger.info("Sentry/Glitchtip enabled (env=%s, traces=5%%).", env)
    return True


def capture_exception(exc: BaseException, *, tags: dict | None = None) -> None:
    """Capture an exception with optional tags. No-op if SDK unavailable."""
    try:
        import sentry_sdk
    except ImportError:
        return
    try:
        with sentry_sdk.new_scope() as scope:
            for k, v in (tags or {}).items():
                scope.set_tag(k, v)
            sentry_sdk.capture_exception(exc)
    except Exception as e:
        # Fail-closed: a broken SDK must never break the caller.
        logger.warning("Sentry capture_exception failed (%s) — swallowing.", e)
