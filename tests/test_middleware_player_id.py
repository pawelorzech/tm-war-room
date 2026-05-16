"""Middleware-level rejection of `X-Player-Id: 0` (and other non-positive ids).

Torn never issues player_id 0 — every legitimate user has a positive ID.
The middleware in `api.main` already validates that the header is a
digit string AND matches the JWT's `sub` claim, but it doesn't enforce
the domain rule that the value must be > 0. With a forged JWT (which
requires the JWT secret), an attacker could otherwise impersonate a
non-existent "player 0" and pass the matching-sub check. Defensive
hardening rather than a live exploit, but cheap to add.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.auth import create_jwt
from tests.helpers import TEST_JWT_SECRET


@pytest.fixture(autouse=True)
def patch_jwt_secret():
    with patch("api.main.JWT_SECRET", TEST_JWT_SECRET), patch(
        "api.routers.chat.JWT_SECRET", TEST_JWT_SECRET
    ):
        yield


def _zero_player_headers() -> dict[str, str]:
    """Build headers for a player_id=0 request — JWT sub also 0 so the
    middleware's sub-vs-header equality check would pass without the
    new > 0 guard."""
    token = create_jwt(
        player_id=0, player_name="Zero", secret=TEST_JWT_SECRET, token_type="session"
    )
    return {
        "X-Player-Id": "0",
        "Authorization": f"Bearer {token}",
    }


def test_player_id_zero_rejected_at_middleware():
    from api.main import app

    client = TestClient(app)
    resp = client.get("/api/team/data", headers=_zero_player_headers())
    # Currently 503 or 200 (handler reached); with the guard, the middleware
    # returns 400 before the route handler ever runs.
    assert resp.status_code == 400, f"Expected 400 for player_id=0, got {resp.status_code}: {resp.text}"
    assert "invalid" in resp.json().get("detail", "").lower()


def test_negative_player_id_already_rejected_by_isdigit():
    # Pre-existing behavior: `-5` doesn't pass isdigit() → 400. Documenting
    # so it stays consistent if anyone ever touches the validation.
    from api.main import app

    token = create_jwt(
        player_id=5, player_name="Five", secret=TEST_JWT_SECRET, token_type="session"
    )
    client = TestClient(app)
    resp = client.get(
        "/api/team/data",
        headers={"X-Player-Id": "-5", "Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_positive_player_id_still_works():
    # Sanity check: the new > 0 guard must not regress normal authed traffic.
    from api.main import app

    token = create_jwt(
        player_id=123, player_name="Alice", secret=TEST_JWT_SECRET, token_type="session"
    )
    client = TestClient(app)
    resp = client.get(
        "/api/team/data",
        headers={"X-Player-Id": "123", "Authorization": f"Bearer {token}"},
    )
    # The middleware should pass; downstream returns 503 (no torn_client in
    # this minimal app boot) or 200. Either is acceptable here — what
    # matters is "not 400 from the middleware".
    assert resp.status_code != 400
