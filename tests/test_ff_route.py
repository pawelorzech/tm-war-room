"""Smoke tests for the Phase 0 stub routers (ff/flights/activity/claims)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client(router) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_ff_healthz_returns_ok():
    from api.routers.ff import router

    resp = _client(router).get("/api/ff/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_flights_healthz_returns_ok():
    from api.routers.flights import router

    resp = _client(router).get("/api/flights/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_activity_healthz_returns_ok():
    from api.routers.activity import router

    resp = _client(router).get("/api/activity/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_claims_healthz_returns_ok():
    from api.routers.claims import router

    resp = _client(router).get("/api/claims/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
