from __future__ import annotations

import secrets as _secrets
import time
from typing import Callable

import jwt
from fastapi import HTTPException

TOKEN_TYPE_SESSION = "session"
TOKEN_TYPE_ADMIN = "admin"


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
    expires_hours: int = 24,
    token_type: str = TOKEN_TYPE_SESSION,
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
    }
    return jwt.encode(payload, secret, algorithm="HS256")


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
    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = {}
        self._last_evict: float = time.time()

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        # F-17: evict dead keys every 5 minutes to bound memory growth.
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


rate_limiter = RateLimiter()
