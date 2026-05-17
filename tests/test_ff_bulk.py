"""Sprint 2 — Bulk FF endpoint (#9 from the perf plan, MVP slice).

Goal: faction-roster-overlay decorates N enemies per page; today that's N
sequential GET /api/ff/{id} calls. The bulk endpoint takes a list of ids
and returns a {id: result} map in ONE round-trip, hitting the same cache
as the single endpoint so warm IDs are essentially free.

This is the BACKEND MVP only. Companion-side migration to call this new
endpoint lives in a follow-up PR so we don't mix backend + UX in one
change.
"""
from __future__ import annotations

import time

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client(monkeypatch, *, enable_ff: bool = True, cached_scores: dict | None = None):
    """Build a FastAPI app wired with the ff router and patched module
    state so we don't touch a live cache."""
    from unittest.mock import AsyncMock, MagicMock
    from api.routers import ff as ff_mod

    monkeypatch.setattr(ff_mod, "ENABLE_FF_SCORE", enable_ff)

    now = int(time.time())
    ff_repo = MagicMock()
    cached = cached_scores or {}

    def _get(pid):
        if pid in cached:
            return {
                "player_id": pid,
                "score": cached[pid],
                "dom_stat": "STR",
                "source": "spy",
                "computed_at": now - 60,
                "expires_at": now + 3600,
            }
        return None

    ff_repo.get.side_effect = _get
    monkeypatch.setattr(ff_mod, "ff_repo", ff_repo)

    async def _fake_compute(*, player_id, **_kw):
        return {
            "score": 1.5,
            "dom_stat": "STR",
            "source": "formula",
            "computed_at": now,
            "expires_at": now + 6 * 3600,
        }

    monkeypatch.setattr(ff_mod, "compute_ff", _fake_compute)
    monkeypatch.setattr(ff_mod, "torn_client", MagicMock())
    monkeypatch.setattr(ff_mod, "key_store", MagicMock())

    app = FastAPI()
    app.include_router(ff_mod.router)
    return TestClient(app)


# ----- Happy path -----


def test_bulk_returns_results_for_every_id(monkeypatch):
    client = _client(monkeypatch, cached_scores={101: 2.0, 202: 1.7})
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": [101, 202]},
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["scores"].keys()) == {"101", "202"}
    assert body["scores"]["101"]["score"] == 2.0
    assert body["scores"]["202"]["score"] == 1.7


def test_bulk_mixes_cache_hits_and_misses(monkeypatch):
    """Cached ID returns cached score; uncached ID falls through to
    compute (stub returns 1.5). Both come back in one response."""
    client = _client(monkeypatch, cached_scores={101: 2.0})
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": [101, 999]},
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scores"]["101"]["score"] == 2.0
    assert body["scores"]["999"]["score"] == 1.5
    assert body["scores"]["101"]["source"] == "spy"
    assert body["scores"]["999"]["source"] == "formula"


def test_bulk_empty_list_returns_empty_map(monkeypatch):
    client = _client(monkeypatch)
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": []},
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"scores": {}}


# ----- Validation -----


def test_bulk_rejects_too_many_ids(monkeypatch):
    """Cap protects the backend from a malicious or buggy caller."""
    client = _client(monkeypatch)
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": list(range(1, 201))},  # 200 > 100 cap
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 422


def test_bulk_rejects_negative_ids(monkeypatch):
    client = _client(monkeypatch)
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": [-1, 100]},
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 422


def test_bulk_returns_503_when_feature_disabled(monkeypatch):
    client = _client(monkeypatch, enable_ff=False)
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": [101]},
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 503


def test_bulk_dedupes_repeated_ids(monkeypatch):
    """Sending [42, 42, 42] should compute once and return one entry."""
    client = _client(monkeypatch, cached_scores={42: 1.9})
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": [42, 42, 42]},
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 200
    assert list(resp.json()["scores"].keys()) == ["42"]
