import time
import pytest
from api.auth import create_jwt, decode_jwt, RateLimiter


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
