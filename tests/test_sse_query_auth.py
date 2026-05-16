"""Phase 5: query-string auth for /api/claims/stream (Phase 4b carry-over).

EventSource can't send custom headers, so the middleware now accepts
``?token=<jwt>&pid=<player_id>`` as an auth source. Scoped exclusively to
``/api/claims/stream`` — every other endpoint still demands the header pair.

Also asserts the per-router ``healthz`` probes added to ``PUBLIC_API_PATHS``
respond 200 without any auth header (Phase 4a carry-over).
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


def _token(player_id: int) -> str:
    return create_jwt(
        player_id=player_id,
        player_name="Alice",
        secret=TEST_JWT_SECRET,
        token_type="session",
    )


def test_sse_query_auth_rejects_other_endpoints():
    """Query-string auth is scoped to /api/claims/stream — try the same
    pattern on a sibling endpoint and the middleware must still 401."""
    from api.main import app

    client = TestClient(app)
    token = _token(123)
    # Hit /api/claims/active with the query-string trick — no headers.
    resp = client.get(f"/api/claims/active?token={token}&pid=123")
    # 400 (missing X-Player-Id) or 401 (no auth header); never the route's 200/503.
    assert resp.status_code in (400, 401)


def test_sse_query_auth_passes_middleware():
    """When the query-string token + pid match, the middleware lets the
    request through. Downstream returns 503 (claim_manager unset in this
    minimal boot) or 200 streaming — either proves middleware passed."""
    from api.main import app

    client = TestClient(app)
    token = _token(123)
    # Use stream=True so we don't hang waiting for body; we only care about
    # the response status (the middleware decision).
    with client.stream(
        "GET", f"/api/claims/stream?token={token}&pid=123"
    ) as resp:
        # Acceptable: 200 (route reached, streaming) or 503 (route reached
        # but claim_manager is None in a bare-boot app). Crucially NOT 400/401.
        assert resp.status_code in (200, 503), resp.read()


def test_sse_query_auth_mismatched_pid_403():
    """Token sub=123 but pid=999 must be rejected as token/header mismatch."""
    from api.main import app

    client = TestClient(app)
    token = _token(123)
    resp = client.get(f"/api/claims/stream?token={token}&pid=999")
    assert resp.status_code == 403


def test_sse_query_auth_invalid_token_401():
    from api.main import app

    client = TestClient(app)
    resp = client.get("/api/claims/stream?token=garbage&pid=123")
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "path",
    [
        "/api/ff/healthz",
        "/api/flights/healthz",
        "/api/activity/healthz",
        "/api/claims/healthz",
    ],
)
def test_feature_healthz_public_no_auth(path: str):
    """Per-router healthz probes must be in PUBLIC_API_PATHS and answer
    200 ``{"ok": true}`` without any auth header. Their docstrings claim
    this contract — make it enforceable."""
    from api.main import app

    client = TestClient(app)
    resp = client.get(path)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"ok": True}, body
