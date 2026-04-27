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


def _before_send(event: dict, _hint: dict) -> dict | None:
    """Sentry SDK hook: scrub PII before transmitting any event."""
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
