import time
import pytest
from api.auth import (
    DEFAULT_TTL_HOURS,
    REMEMBER_TTL_HOURS,
    RateLimiter,
    TOKEN_TYPE_SESSION,
    create_jwt,
    decode_jwt,
    maybe_renew_jwt,
)


def test_create_and_decode_jwt():
    token = create_jwt(player_id=2206960, player_name="Bombla", secret="test-secret")
    payload = decode_jwt(token, "test-secret")
    assert payload is not None
    assert payload["sub"] == 2206960  # stored as str in JWT, decoded back to int
    assert payload["name"] == "Bombla"
    assert "iat" in payload
    assert "exp" in payload


def test_decode_expired_jwt():
    token = create_jwt(player_id=1, player_name="X", secret="s", expires_hours=0)
    time.sleep(0.1)
    payload = decode_jwt(token, "s")
    assert payload is None


def test_decode_wrong_secret():
    token = create_jwt(player_id=1, player_name="X", secret="right")
    payload = decode_jwt(token, "wrong")
    assert payload is None


def test_decode_garbage():
    payload = decode_jwt("not.a.token", "secret")
    assert payload is None


def test_rate_limiter_allows_within_limit():
    rl = RateLimiter()
    for _ in range(5):
        assert rl.check("test-key", max_requests=5, window_seconds=60) is True


def test_rate_limiter_blocks_over_limit():
    rl = RateLimiter()
    for _ in range(5):
        rl.check("test-key", max_requests=5, window_seconds=60)
    assert rl.check("test-key", max_requests=5, window_seconds=60) is False


def test_rate_limiter_separate_keys():
    rl = RateLimiter()
    for _ in range(5):
        rl.check("key-a", max_requests=5, window_seconds=60)
    assert rl.check("key-a", max_requests=5, window_seconds=60) is False
    assert rl.check("key-b", max_requests=5, window_seconds=60) is True


def test_create_jwt_remember_claim_and_ttl():
    token = create_jwt(
        player_id=2362436, player_name="Bombel", secret="s",
        expires_hours=REMEMBER_TTL_HOURS, remember=True,
    )
    payload = decode_jwt(token, "s")
    assert payload is not None
    assert payload["remember"] is True
    assert payload["exp"] - payload["iat"] == REMEMBER_TTL_HOURS * 3600


def test_create_jwt_default_no_remember():
    token = create_jwt(player_id=1, player_name="X", secret="s")
    payload = decode_jwt(token, "s")
    assert payload is not None
    assert payload["remember"] is False
    assert payload["exp"] - payload["iat"] == DEFAULT_TTL_HOURS * 3600


def test_maybe_renew_jwt_under_threshold_returns_none():
    token = create_jwt(
        player_id=1, player_name="X", secret="s",
        expires_hours=REMEMBER_TTL_HOURS, remember=True,
    )
    payload = decode_jwt(token, "s")
    assert maybe_renew_jwt(payload, "s") is None


def test_maybe_renew_jwt_past_threshold_returns_new_token():
    now = int(time.time())
    aged_payload = {
        "sub": 1, "name": "X", "token_type": TOKEN_TYPE_SESSION,
        # Issued 80% of lifetime ago — past the 50% renewal threshold.
        "iat": now - int(REMEMBER_TTL_HOURS * 3600 * 0.8),
        "exp": now + int(REMEMBER_TTL_HOURS * 3600 * 0.2),
        "jti": "old-jti",
        "remember": True,
    }
    new_token = maybe_renew_jwt(aged_payload, "s")
    assert new_token is not None
    new_payload = decode_jwt(new_token, "s")
    assert new_payload is not None
    assert new_payload["remember"] is True
    assert new_payload["sub"] == 1
    assert new_payload["exp"] - new_payload["iat"] == REMEMBER_TTL_HOURS * 3600
    assert new_payload["jti"] != "old-jti"


def test_maybe_renew_jwt_no_remember_returns_none_even_past_threshold():
    now = int(time.time())
    aged_payload = {
        "sub": 1, "name": "X", "token_type": TOKEN_TYPE_SESSION,
        "iat": now - int(DEFAULT_TTL_HOURS * 3600 * 0.9),
        "exp": now + int(DEFAULT_TTL_HOURS * 3600 * 0.1),
        "jti": "j",
        "remember": False,
    }
    assert maybe_renew_jwt(aged_payload, "s") is None


def test_maybe_renew_jwt_admin_token_not_renewed():
    """Admin tokens (F-06) intentionally don't slide — escalation requires fresh login."""
    now = int(time.time())
    aged_payload = {
        "sub": 1, "name": "X", "token_type": "admin",
        "iat": now - int(REMEMBER_TTL_HOURS * 3600 * 0.9),
        "exp": now + int(REMEMBER_TTL_HOURS * 3600 * 0.1),
        "jti": "j",
        "remember": True,  # even with remember flag, admin tokens don't renew
    }
    assert maybe_renew_jwt(aged_payload, "s") is None
