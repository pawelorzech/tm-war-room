from __future__ import annotations

import time

import jwt
from fastapi import HTTPException


def create_jwt(
    player_id: int,
    player_name: str,
    secret: str,
    expires_hours: int = 24,
    token_type: str = "session",
) -> str:
    now = int(time.time())
    payload = {
        "sub": str(player_id),
        "name": player_name,
        "token_type": token_type,
        "iat": now,
        "exp": now + expires_hours * 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_jwt(token: str, secret: str) -> dict | None:
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        payload["sub"] = int(payload["sub"])
        return payload
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


def require_bearer_token(
    auth_header: str,
    secret: str,
    allowed_token_types: tuple[str, ...] = ("session", "admin"),
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

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        entries = self._requests.get(key, [])
        entries = [t for t in entries if t > cutoff]
        if len(entries) >= max_requests:
            self._requests[key] = entries
            return False
        entries.append(now)
        self._requests[key] = entries
        return True


rate_limiter = RateLimiter()
