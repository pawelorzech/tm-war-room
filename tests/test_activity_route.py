"""Route tests for the Phase 3A activity tracker API."""
from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.db.migrations.runner import run_migrations
from api.db.repos.activity import ActivityRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return ActivityRepository(db_path=db_path)


def _client(monkeypatch, repo: ActivityRepository, *, flag_on: bool, faction_member_ids=None):
    from api.routers import activity as activity_mod

    monkeypatch.setattr("api.config.ENABLE_ACTIVITY", flag_on)
    monkeypatch.setattr(activity_mod, "ENABLE_ACTIVITY", flag_on)
    activity_mod.activity_repo = repo
    activity_mod.key_store = SimpleNamespace(
        has_key=lambda pid: pid in set(faction_member_ids or []),
    )
    app = FastAPI()
    app.include_router(activity_mod.router)
    return TestClient(app)


# ── healthz survives flag-off ─────────────────────────────────────────


def test_activity_healthz_always_returns_ok(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=False)
    resp = client.get("/api/activity/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ── GET /api/activity/{player_id} ────────────────────────────────────


def test_get_activity_503_when_flag_off(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=False)
    resp = client.get("/api/activity/100")
    assert resp.status_code == 503
    assert resp.json() == {"detail": "feature disabled"}


def test_get_activity_returns_heatmap_when_flag_on(monkeypatch, repo):
    """Seed two bins in the most recent 14-day window so the route picks them up."""
    import time as _time
    from datetime import datetime, timezone

    # Pick the most recent Monday 14:00 UTC inside the retention window.
    now = int(_time.time())
    today = datetime.fromtimestamp(now, tz=timezone.utc)
    # Snap back to the latest Monday at 14:00 UTC.
    days_back = today.weekday()  # 0 = Monday → no shift
    if days_back == 0 and today.hour < 14:
        days_back = 7  # earlier today doesn't have 14:00 yet → use last Monday
    target = today.replace(hour=14, minute=0, second=0, microsecond=0)
    target = target.fromtimestamp(target.timestamp() - days_back * 86400, tz=timezone.utc)
    mon_14 = int(target.timestamp())
    mon_14 = mon_14 - (mon_14 % 300)

    repo.add_bin(player_id=100, bin_start=mon_14, online_seconds=300)
    repo.add_bin(player_id=100, bin_start=mon_14 + 300, online_seconds=300)

    client = _client(monkeypatch, repo, flag_on=True)
    resp = client.get("/api/activity/100")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["bins"]) == 7
    assert all(len(row) == 24 for row in body["bins"])
    # Monday (weekday=0) at hour 14 sums both bins.
    assert body["bins"][0][14] == 600
    # 4h window centered on the only active hour → exact start depends on
    # tie-breaking; we just assert the format is right.
    assert body["most_active_window"].endswith("UTC")


def test_get_activity_empty_heatmap_when_no_bins(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=True)
    resp = client.get("/api/activity/999")
    assert resp.status_code == 200
    body = resp.json()
    assert sum(sum(row) for row in body["bins"]) == 0
    # Zero heatmap defaults to 00:00-04:00 UTC (earliest tie).
    assert body["most_active_window"] == "00:00-04:00 UTC"


def test_get_activity_rejects_invalid_player_id(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=True)
    resp = client.get("/api/activity/0")
    assert resp.status_code == 400


# ── POST /api/activity/track/{player_id} ─────────────────────────────


def test_track_enrolls_outsider_returns_204(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=True)
    resp = client.post("/api/activity/track/555", headers={"X-Player-Id": "100"})
    assert resp.status_code == 204
    outsiders = repo.tracked_outsiders()
    assert [o["player_id"] for o in outsiders] == [555]


def test_track_is_idempotent(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=True)

    r1 = client.post("/api/activity/track/555", headers={"X-Player-Id": "100"})
    r2 = client.post("/api/activity/track/555", headers={"X-Player-Id": "100"})
    assert r1.status_code == 204
    assert r2.status_code == 204
    # Still only one outsider row.
    assert len(repo.tracked_outsiders()) == 1


def test_track_skips_faction_members(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=True, faction_member_ids=[2362436])
    resp = client.post(
        "/api/activity/track/2362436",
        headers={"X-Player-Id": "100"},
    )
    assert resp.status_code == 204
    # Faction member should NOT be enrolled as an outsider.
    assert repo.tracked_outsiders() == []


def test_track_503_when_flag_off(monkeypatch, repo):
    client = _client(monkeypatch, repo, flag_on=False)
    resp = client.post("/api/activity/track/555", headers={"X-Player-Id": "100"})
    assert resp.status_code == 503


def test_track_rate_limit_returns_429(monkeypatch, repo):
    # Pinhole the rate limit so the test runs fast and deterministic.
    from api import auth as auth_mod
    from api.auth import HybridRateLimiter

    auth_mod.rate_limiter = HybridRateLimiter()  # fresh in-memory bucket
    # Reach into the activity router so it uses our fresh limiter.
    from api.routers import activity as activity_mod
    monkeypatch.setattr(activity_mod, "rate_limiter", auth_mod.rate_limiter)

    client = _client(monkeypatch, repo, flag_on=True)
    # 30 enrollments are allowed per 60s; the 31st must be rejected.
    for i in range(30):
        r = client.post(f"/api/activity/track/{1000 + i}", headers={"X-Player-Id": "100"})
        assert r.status_code == 204
    rejected = client.post("/api/activity/track/2000", headers={"X-Player-Id": "100"})
    assert rejected.status_code == 429
