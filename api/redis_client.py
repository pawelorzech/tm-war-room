"""Redis client wrapper with graceful degradation.

When REDIS_URL is set and reachable, returns a real async Redis client.
When unset or unreachable, all helpers return None / no-op so callers can
fall back to per-worker in-memory state. This keeps single-worker dev
deployments (no Redis required) working identically to multi-worker prod.

Sprint 2 #1+#19: shared cache, chat pub/sub, scheduler leader-election,
rate limiter — all read REDIS_URL via this module.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger("tm-hub.redis")

_client = None  # type: ignore[var-annotated]
_url: str | None = None
_initialized = False


def _read_url() -> str | None:
    return os.environ.get("REDIS_URL") or None


async def init_redis() -> Optional[object]:
    """Initialize singleton Redis client. Idempotent. Returns client or None."""
    global _client, _url, _initialized
    if _initialized:
        return _client

    url = _read_url()
    _url = url
    _initialized = True

    if not url:
        logger.info("REDIS_URL not set — running without Redis (per-worker state).")
        return None

    try:
        import redis.asyncio as aioredis  # type: ignore
    except ImportError:
        logger.warning("redis library not installed — falling back to per-worker state.")
        return None

    try:
        client = aioredis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=5.0,
            health_check_interval=30,
            retry_on_timeout=True,
        )
        await client.ping()
        _client = client
        logger.info("Redis connected: %s", _redact(url))
        return client
    except Exception as e:
        logger.warning("Redis unavailable (%s) — falling back to per-worker state.", e)
        _client = None
        return None


def get_redis():
    """Return the shared Redis client or None if not available."""
    return _client


async def close_redis() -> None:
    global _client, _initialized
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
    _client = None
    _initialized = False


def _redact(url: str) -> str:
    """Strip password from URL for safe logging."""
    if "@" not in url:
        return url
    scheme_userpass, _, rest = url.partition("@")
    scheme, _, userpass = scheme_userpass.rpartition("//")
    user, _, _pw = userpass.partition(":")
    return f"{scheme}//{user}:***@{rest}"
