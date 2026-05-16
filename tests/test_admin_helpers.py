"""Unit tests for the pure token-extraction helpers in api/admin.py.

Both helpers accept admin/session credentials either via the legacy
`Authorization: Bearer ...` header or via a cookie (`tm_admin` for admin,
`tm_session` for member sessions) and normalize the result to a Bearer string.
These tests pin that contract without spinning up the full FastAPI app.
"""

from __future__ import annotations

from starlette.requests import Request

from api.admin import _admin_bearer_or_cookie, _session_bearer_or_cookie


def _make_request(headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    """Build a minimal Starlette Request from a raw header list.

    Starlette lowercases header names internally; we pass them lowercase too
    to mirror what an ASGI server actually delivers.
    """
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers or [],
    }
    return Request(scope)


# ---------------------------------------------------------------------------
# _admin_bearer_or_cookie
# ---------------------------------------------------------------------------


def test_admin_bearer_header_returned_verbatim():
    req = _make_request([(b"authorization", b"Bearer admin-token-abc")])
    assert _admin_bearer_or_cookie(req) == "Bearer admin-token-abc"


def test_admin_cookie_wrapped_when_no_header():
    req = _make_request([(b"cookie", b"tm_admin=cookie-token-xyz")])
    assert _admin_bearer_or_cookie(req) == "Bearer cookie-token-xyz"


def test_admin_returns_empty_when_no_header_or_cookie():
    req = _make_request([])
    assert _admin_bearer_or_cookie(req) == ""


def test_admin_non_bearer_header_falls_through_to_cookie():
    # A non-"Bearer " auth scheme (e.g. Basic) should be ignored and the
    # cookie path taken instead.
    req = _make_request(
        [
            (b"authorization", b"Basic dXNlcjpwYXNz"),
            (b"cookie", b"tm_admin=fallback-token"),
        ]
    )
    assert _admin_bearer_or_cookie(req) == "Bearer fallback-token"


def test_admin_lowercase_authorization_header_found():
    # Starlette normalizes header names to lowercase; the helper uses
    # `headers.get("authorization", ...)` so this MUST work.
    req = _make_request([(b"authorization", b"Bearer lower-case-header")])
    assert _admin_bearer_or_cookie(req) == "Bearer lower-case-header"


def test_admin_ignores_tm_session_cookie():
    # _admin_bearer_or_cookie must only read tm_admin, never tm_session.
    req = _make_request([(b"cookie", b"tm_session=member-token")])
    assert _admin_bearer_or_cookie(req) == ""


# ---------------------------------------------------------------------------
# _session_bearer_or_cookie
# ---------------------------------------------------------------------------


def test_session_bearer_header_returned_verbatim():
    req = _make_request([(b"authorization", b"Bearer session-token-abc")])
    assert _session_bearer_or_cookie(req) == "Bearer session-token-abc"


def test_session_cookie_wrapped_when_no_header():
    req = _make_request([(b"cookie", b"tm_session=session-cookie-xyz")])
    assert _session_bearer_or_cookie(req) == "Bearer session-cookie-xyz"


def test_session_returns_empty_when_no_header_or_cookie():
    req = _make_request([])
    assert _session_bearer_or_cookie(req) == ""


def test_session_non_bearer_header_falls_through_to_cookie():
    req = _make_request(
        [
            (b"authorization", b"Basic dXNlcjpwYXNz"),
            (b"cookie", b"tm_session=fallback-session"),
        ]
    )
    assert _session_bearer_or_cookie(req) == "Bearer fallback-session"


def test_session_lowercase_authorization_header_found():
    req = _make_request([(b"authorization", b"Bearer session-lower-case")])
    assert _session_bearer_or_cookie(req) == "Bearer session-lower-case"


def test_session_ignores_tm_admin_cookie():
    # _session_bearer_or_cookie must only read tm_session, never tm_admin.
    req = _make_request([(b"cookie", b"tm_admin=admin-token")])
    assert _session_bearer_or_cookie(req) == ""
