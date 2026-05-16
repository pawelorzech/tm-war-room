"""Sprint 0 — Companion RUM beacon endpoint.

Spec: ``extension/docs/rum-privacy-review.md``. The endpoint accepts
anonymous performance signals only. PII fields are rejected (schema)
or stripped (defence in depth). Rate-limited at 1 req / min / IP via
the existing ``rate_limiter`` singleton.

These tests are TDD red-first: they were authored before the router
exists. Run pytest against the freshly added router to flip them green.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Sprint 0: each test gets a fresh budget. The in-memory rate_limiter is
    a process-global; without this fixture the 1-req-per-minute cap leaks
    across tests and everything after the first turns into 429."""
    from api import auth

    auth.rate_limiter._local._requests.clear()
    yield
    auth.rate_limiter._local._requests.clear()


def _valid_payload() -> dict:
    return {
        "v": "0.27.2",
        "page_kind": "profile",
        "tti_ms": 145,
        "tbt_ms": 32,
        "fcp_ms": 280,
        "longtask_count": 1,
        "polls_per_min_visible": 4,
        "polls_per_min_hidden": 0,
        "errors": 0,
        "ts": "2026-05-17T10:00:00Z",
    }


def _client() -> TestClient:
    from api.routers.companion_rum import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


# ----- Happy path -----


def test_valid_payload_returns_204():
    resp = _client().post("/api/companion/rum", json=_valid_payload())
    assert resp.status_code == 204
    assert resp.content == b""


def test_valid_payload_with_null_fcp():
    """Firefox <84 and some Safari versions don't expose first-contentful-paint;
    the schema permits null so we don't push bad data."""
    payload = _valid_payload() | {"fcp_ms": None}
    resp = _client().post("/api/companion/rum", json=payload)
    assert resp.status_code == 204


# ----- PII rejection / stripping -----


@pytest.mark.parametrize(
    "field,value",
    [
        ("player_id", 2362436),
        ("faction_id", 11559),
        ("url", "https://www.torn.com/profiles.php?XID=2362436"),
        ("user_agent", "Mozilla/5.0"),
        ("ip", "1.2.3.4"),
        ("referrer", "https://www.torn.com/"),
        ("message", "hi mate"),
        ("stack", "Error: oops\n  at line 42"),
        ("api_key", "abcdef"),
    ],
)
def test_pii_fields_are_rejected_or_stripped(field, value):
    """Extra/PII fields must never reach the backend store.

    Schema either rejects (422) or strips (204 with the field gone). Either is
    fine — what's forbidden is silent acceptance into the persisted payload.
    """
    payload = _valid_payload() | {field: value}
    resp = _client().post("/api/companion/rum", json=payload)
    # Accept either strict rejection or lenient strip — both satisfy the
    # privacy guarantee. We assert the persisted payload (queryable via the
    # public preview endpoint added below) does NOT include the field.
    assert resp.status_code in (204, 422)
    if resp.status_code == 204:
        # Verify the persisted record does not include the PII field.
        from api.routers import companion_rum as mod
        assert mod._last_persisted is not None
        assert field not in mod._last_persisted


# ----- Schema validation -----


def test_invalid_page_kind_rejected():
    payload = _valid_payload() | {"page_kind": "secret-faction-page"}
    resp = _client().post("/api/companion/rum", json=payload)
    assert resp.status_code == 422


def test_missing_required_field_rejected():
    payload = _valid_payload()
    del payload["tti_ms"]
    resp = _client().post("/api/companion/rum", json=payload)
    assert resp.status_code == 422


@pytest.mark.parametrize("field", ["tti_ms", "tbt_ms", "longtask_count", "errors"])
def test_negative_numbers_rejected(field):
    payload = _valid_payload() | {field: -1}
    resp = _client().post("/api/companion/rum", json=payload)
    assert resp.status_code == 422


def test_absurdly_large_tti_rejected():
    """A 10-minute TTI is either a clock skew or an attempt to poison the
    aggregate. Reject anything over a sane ceiling (60 s)."""
    payload = _valid_payload() | {"tti_ms": 600_000}
    resp = _client().post("/api/companion/rum", json=payload)
    assert resp.status_code == 422


# ----- Rate limiting -----


def test_rate_limited_after_one_per_minute_per_ip(monkeypatch):
    """The privacy doc commits to 1 req / min / IP. Re-using the existing
    ``rate_limiter`` singleton from api.auth keeps RUM in the same bucket
    pattern as register/login/etc."""
    from api import auth

    # Reset the in-memory limiter so this test is hermetic.
    auth.rate_limiter._local._requests.clear()

    client = _client()
    r1 = client.post("/api/companion/rum", json=_valid_payload())
    r2 = client.post("/api/companion/rum", json=_valid_payload())
    assert r1.status_code == 204
    assert r2.status_code == 429


# ----- Public path -----


def test_endpoint_is_in_public_api_paths():
    """The Companion fires the beacon without an Authorization header.
    The middleware whitelist must include the RUM path or all writes 401."""
    from api import main

    assert "/api/companion/rum" in main.PUBLIC_API_PATHS


# ----- Feature flag gate -----


def test_rum_enabled_flag_in_feature_flags(monkeypatch):
    """Backend rollout lever (privacy doc): /api/extension/feature-flags
    must expose ``rum_enabled`` so the Companion can no-op when off."""
    from api.routers import extension as ext_mod

    monkeypatch.setattr(ext_mod, "ENABLE_RUM", False)
    app = FastAPI()
    app.include_router(ext_mod.router)
    client = TestClient(app)
    resp = client.get("/api/extension/feature-flags")
    assert resp.status_code == 200
    body = resp.json()
    assert "rum_enabled" in body
    assert body["rum_enabled"] is False


def test_rum_enabled_defaults_off_in_config():
    """Privacy commitment: until sign-off completes, the flag is off."""
    from api import config

    assert config.ENABLE_RUM is False
