"""Smoke + behaviour tests for the FF router.

Phase 0 left only ``/healthz``. Phase 1A adds ``GET /api/ff/{player_id}``
with feature-flag gating, cache short-circuit, and compute path. We test
through a bare FastAPI app (no auth middleware) so the tests focus on the
router contract — main.py wires the global JWT middleware separately and
that's tested elsewhere (``test_middleware_player_id``).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
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


def test_ff_score_503_when_flag_disabled(monkeypatch):
    """Feature flag off → 503 with explicit detail. Companion treats this
    as "feature unavailable" and hides the chip."""
    import api.routers.ff as ff_mod

    monkeypatch.setattr("api.routers.ff.ENABLE_FF_SCORE", False)
    client = _client(ff_mod.router)
    resp = client.get("/api/ff/12345", headers={"X-Player-Id": "1"})
    assert resp.status_code == 503
    assert resp.json()["detail"] == "feature disabled"


def test_ff_score_200_with_computed_body_when_flag_on(monkeypatch):
    """Flag on, cache miss → compute runs, response carries the expected
    keys and the result is persisted via ff_repo.upsert."""
    import api.routers.ff as ff_mod

    monkeypatch.setattr("api.routers.ff.ENABLE_FF_SCORE", True)

    # Empty cache → compute fires.
    ff_repo = MagicMock()
    ff_repo.get.return_value = None
    monkeypatch.setattr(ff_mod, "ff_repo", ff_repo)
    monkeypatch.setattr(ff_mod, "torn_client", MagicMock())
    monkeypatch.setattr(ff_mod, "key_store", MagicMock())

    async def _fake_compute(**_kw):
        return {
            "score": 2.5, "dom_stat": "STR", "source": "formula",
            "computed_at": 1_700_000_000, "expires_at": 1_700_021_600,
        }

    monkeypatch.setattr(ff_mod, "compute_ff", _fake_compute)

    client = _client(ff_mod.router)
    resp = client.get("/api/ff/42", headers={"X-Player-Id": "1"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["player_id"] == 42
    assert body["score"] == 2.5
    assert body["dom_stat"] == "STR"
    assert body["source"] == "formula"
    assert body["computed_at"] == 1_700_000_000
    assert body["expires_at"] == 1_700_021_600
    ff_repo.upsert.assert_called_once()


def test_ff_score_returns_cached_when_fresh(monkeypatch):
    """Cache hit → response carries cached values, compute is NOT invoked."""
    import api.routers.ff as ff_mod

    monkeypatch.setattr("api.routers.ff.ENABLE_FF_SCORE", True)

    import time as _time

    now = int(_time.time())
    ff_repo = MagicMock()
    ff_repo.get.return_value = {
        "score": 1.7, "dom_stat": "DEF", "source": "spy",
        "computed_at": now - 60, "expires_at": now + 3600,
    }
    monkeypatch.setattr(ff_mod, "ff_repo", ff_repo)
    monkeypatch.setattr(ff_mod, "torn_client", MagicMock())
    monkeypatch.setattr(ff_mod, "key_store", MagicMock())

    async def _explode(**_kw):
        raise AssertionError("compute_ff must not run on cache hit")

    monkeypatch.setattr(ff_mod, "compute_ff", _explode)

    client = _client(ff_mod.router)
    resp = client.get("/api/ff/42", headers={"X-Player-Id": "1"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 1.7
    assert body["dom_stat"] == "DEF"
    assert body["source"] == "spy"
    # Cache hit must not write back.
    ff_repo.upsert.assert_not_called()


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
