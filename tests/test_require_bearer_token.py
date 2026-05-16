"""Unit tests for `api.auth.require_bearer_token`.

This is the single chokepoint that turns an `Authorization: Bearer <jwt>`
header value into a validated payload (or a 401). Every authenticated
endpoint passes through it via the middleware. Previously covered only
through full integration tests of /api/* routes — adding direct unit
tests catches regressions in (a) the Bearer-prefix check, (b) JWT decode
failures, and (c) the token-type allow-list, without spinning up the
whole app.
"""

import pytest
from fastapi import HTTPException

from api.auth import (
    TOKEN_TYPE_ADMIN,
    TOKEN_TYPE_SESSION,
    create_jwt,
    require_bearer_token,
)


SECRET = "test-secret-shared"


def _bearer(token: str) -> str:
    return f"Bearer {token}"


def test_valid_bearer_session_token_returns_payload():
    token = create_jwt(player_id=42, player_name="Alice", secret=SECRET, token_type="session")
    payload = require_bearer_token(_bearer(token), SECRET, allowed_token_types=(TOKEN_TYPE_SESSION,))
    assert payload["sub"] == 42
    assert payload["name"] == "Alice"
    assert payload["token_type"] == TOKEN_TYPE_SESSION


def test_valid_bearer_admin_token_when_admin_allowed():
    token = create_jwt(player_id=2362436, player_name="Bombel", secret=SECRET, token_type="admin")
    payload = require_bearer_token(
        _bearer(token), SECRET, allowed_token_types=(TOKEN_TYPE_SESSION, TOKEN_TYPE_ADMIN)
    )
    assert payload["sub"] == 2362436
    assert payload["token_type"] == TOKEN_TYPE_ADMIN


def test_missing_bearer_prefix_raises_401():
    token = create_jwt(player_id=42, player_name="Alice", secret=SECRET, token_type="session")
    with pytest.raises(HTTPException) as exc:
        # No "Bearer " prefix.
        require_bearer_token(token, SECRET)
    assert exc.value.status_code == 401
    assert "authorization" in exc.value.detail.lower()


def test_wrong_scheme_raises_401():
    with pytest.raises(HTTPException) as exc:
        require_bearer_token("Basic dXNlcjpwYXNz", SECRET)
    assert exc.value.status_code == 401


def test_empty_header_raises_401():
    with pytest.raises(HTTPException) as exc:
        require_bearer_token("", SECRET)
    assert exc.value.status_code == 401


def test_malformed_jwt_raises_401():
    with pytest.raises(HTTPException) as exc:
        require_bearer_token(_bearer("not.a.valid.jwt"), SECRET)
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower() or "invalid" in exc.value.detail.lower()


def test_wrong_secret_raises_401():
    # Token signed with one secret, validated with a different one.
    token = create_jwt(player_id=42, player_name="Alice", secret=SECRET, token_type="session")
    with pytest.raises(HTTPException) as exc:
        require_bearer_token(_bearer(token), "different-secret-entirely")
    assert exc.value.status_code == 401


def test_disallowed_token_type_raises_401():
    # Admin token rejected when only session tokens allowed.
    admin_token = create_jwt(player_id=42, player_name="Alice", secret=SECRET, token_type="admin")
    with pytest.raises(HTTPException) as exc:
        require_bearer_token(
            _bearer(admin_token), SECRET, allowed_token_types=(TOKEN_TYPE_SESSION,)
        )
    assert exc.value.status_code == 401
    assert "token type" in exc.value.detail.lower()


def test_default_allow_list_accepts_both_session_and_admin():
    # Calling without an explicit allowed_token_types must accept the
    # two normal kinds — guards against a future refactor that tightens
    # the default in a way that breaks every existing caller.
    session_token = create_jwt(player_id=1, player_name="A", secret=SECRET, token_type="session")
    admin_token = create_jwt(player_id=2, player_name="B", secret=SECRET, token_type="admin")
    s = require_bearer_token(_bearer(session_token), SECRET)
    a = require_bearer_token(_bearer(admin_token), SECRET)
    assert s["token_type"] == TOKEN_TYPE_SESSION
    assert a["token_type"] == TOKEN_TYPE_ADMIN
