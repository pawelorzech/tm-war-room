from __future__ import annotations

import secrets as _secrets
import time
from typing import Callable

import jwt
from fastapi import HTTPException

TOKEN_TYPE_SESSION = "session"
TOKEN_TYPE_ADMIN = "admin"

DEFAULT_TTL_HOURS = 24
REMEMBER_TTL_HOURS = 24 * 90  # 90 days
RENEW_THRESHOLD = 0.5  # renew when more than 50% of lifetime has elapsed


# F-16: pluggable revocation predicate. Set at startup from main.py to point at
# RevokedJwtRepository.is_revoked. Default: never revoked (no DB, dev / tests).
_revocation_check: Callable[[str], bool] = lambda _jti: False


def set_revocation_check(fn: Callable[[str], bool]) -> None:
    global _revocation_check
    _revocation_check = fn


def create_jwt(
    player_id: int,
    player_name: str,
    secret: str,
    expires_hours: int = DEFAULT_TTL_HOURS,
    token_type: str = TOKEN_TYPE_SESSION,
    remember: bool = False,
) -> str:
    now = int(time.time())
    payload = {
        "sub": str(player_id),
        "name": player_name,
        "token_type": token_type,
        "iat": now,
        "exp": now + expires_hours * 3600,
        # F-16: per-token unique ID enables targeted revocation.
        "jti": _secrets.token_urlsafe(12),
        "remember": bool(remember),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def maybe_renew_jwt(payload: dict, secret: str) -> str | None:
    """Return a fresh long-lived token if the current one is past the renewal threshold.

    Returns None when:
      * payload is not a remember-me token (only session tokens with remember=True slide),
      * less than RENEW_THRESHOLD of the lifetime has elapsed,
      * payload is missing iat/exp (defensive — shouldn't happen for tokens we mint).

    The old token is intentionally NOT revoked so concurrent in-flight requests
    that already attached it as Authorization header keep working until natural
    expiry.
    """
    if not payload.get("remember"):
        return None
    if payload.get("token_type") != TOKEN_TYPE_SESSION:
        return None
    iat = payload.get("iat")
    exp = payload.get("exp")
    if not isinstance(iat, int) or not isinstance(exp, int) or exp <= iat:
        return None
    now = int(time.time())
    elapsed = now - iat
    lifetime = exp - iat
    if elapsed / lifetime < RENEW_THRESHOLD:
        return None
    sub = payload.get("sub")
    name = payload.get("name", "")
    if sub is None:
        return None
    return create_jwt(
        player_id=int(sub),
        player_name=str(name),
        secret=secret,
        expires_hours=REMEMBER_TTL_HOURS,
        token_type=TOKEN_TYPE_SESSION,
        remember=True,
    )


def decode_jwt(token: str, secret: str) -> dict | None:
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        payload["sub"] = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
    # F-16: reject explicitly revoked tokens.
    jti = payload.get("jti")
    if jti and _revocation_check(jti):
        return None
    return payload


def require_bearer_token(
    auth_header: str,
    secret: str,
    allowed_token_types: tuple[str, ...] = (TOKEN_TYPE_SESSION, TOKEN_TYPE_ADMIN),
) -> dict:
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization")
    payload = decode_jwt(auth_header[7:], secret)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("token_type") not in allowed_token_types:
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


class RateLimiter:
    """In-memory rate limiter (per-worker).

    F-17: evicts dead keys every 5 min to bound memory growth.
    Multi-worker note: this is per-worker, so effective limits scale with worker
    count (e.g. max=10 with 2 workers = up to 20 across cluster). Use
    :class:`RedisRateLimiter` for shared state when correctness matters.
    """

    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = {}
        self._last_evict: float = time.time()

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        if now - self._last_evict > 300:
            self._requests = {
                k: [t for t in v if t > cutoff]
                for k, v in self._requests.items()
                if any(t > cutoff for t in v)
            }
            self._last_evict = now
        entries = self._requests.get(key, [])
        entries = [t for t in entries if t > cutoff]
        if len(entries) >= max_requests:
            self._requests[key] = entries
            return False
        entries.append(now)
        self._requests[key] = entries
        return True


class HybridRateLimiter:
    """Rate limiter that prefers Redis (shared) and falls back to in-memory per-worker.

    Sync ``check()`` uses in-memory only (existing call sites are sync). Use
    ``check_async()`` to opt into the Redis-backed shared limit when available.
    Both paths use the same key/limit semantics: max N actions per window seconds.
    """

    def __init__(self) -> None:
        self._local = RateLimiter()

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        return self._local.check(key, max_requests, window_seconds)

    async def check_async(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        from api.redis_client import get_redis
        r = get_redis()
        if r is None:
            return self._local.check(key, max_requests, window_seconds)
        rkey = f"tm:ratelimit:{key}"
        try:
            pipe = r.pipeline()
            pipe.incr(rkey, 1)
            pipe.expire(rkey, window_seconds, nx=True)
            count, _ = await pipe.execute()
            return int(count) <= max_requests
        except Exception:
            return self._local.check(key, max_requests, window_seconds)


rate_limiter = HybridRateLimiter()
