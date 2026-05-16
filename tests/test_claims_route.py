"""HTTP-level tests for /api/claims routes (Phase 4A)."""
from __future__ import annotations

import os
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.db.migrations.runner import run_migrations
from api.db.repos.claims import ClaimRepository
from api.routers import claims as claims_mod


class FakeKeyStore:
    """Minimal stub matching the few KeyStore methods the claims router calls."""

    def __init__(self, members: dict[int, str], admins: tuple[int, ...] = ()):
        self._members = dict(members)
        self._admins = set(admins)

    def has_key(self, player_id: int) -> bool:
        return player_id in self._members

    def get_key(self, player_id: int):
        name = self._members.get(player_id)
        if name is None:
            return None
        return {"player_id": player_id, "player_name": name, "api_key": "x", "is_faction_key": False}

    def get_keys_metadata(self):
        return [{"player_id": pid, "player_name": name} for pid, name in self._members.items()]

    def is_admin(self, player_id: int) -> bool:
        return player_id in self._admins


@pytest.fixture
def wired(tmp_path, monkeypatch):
    """Wire the router module with a real ClaimRepository + fake key_store, flag ON.

    Patching the module-level globals (key_store, claim_repo, claim_manager)
    mirrors how main.py's lifespan injects state.
    """
    db_path = str(tmp_path / "claims.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    repo = ClaimRepository(db_path=db_path)
    ks = FakeKeyStore({100: "Alice", 200: "Bob", 300: "Carol"}, admins=(999,))
    ks._members[999] = "AdminAce"

    monkeypatch.setattr(claims_mod, "ENABLE_HIT_CALLING", True)
    monkeypatch.setattr(claims_mod, "key_store", ks)
    monkeypatch.setattr(claims_mod, "claim_repo", repo)
    # Capture published events so tests can assert on them without a real loop.
    published: list[tuple[str, dict]] = []
    mgr = MagicMock()

    async def _publish(event, faction_id):  # noqa: ANN001
        published.append((event["type"], event))

    mgr.publish = _publish
    monkeypatch.setattr(claims_mod, "claim_manager", mgr)

    app = FastAPI()
    app.include_router(claims_mod.router)
    return {
        "client": TestClient(app),
        "repo": repo,
        "key_store": ks,
        "published": published,
    }


@pytest.fixture
def flag_off(tmp_path, monkeypatch):
    """Same wiring as ``wired`` but feature flag is OFF — endpoints must 503."""
    db_path = str(tmp_path / "claims.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    repo = ClaimRepository(db_path=db_path)
    ks = FakeKeyStore({100: "Alice"})
    monkeypatch.setattr(claims_mod, "ENABLE_HIT_CALLING", False)
    monkeypatch.setattr(claims_mod, "key_store", ks)
    monkeypatch.setattr(claims_mod, "claim_repo", repo)
    monkeypatch.setattr(claims_mod, "claim_manager", MagicMock())
    app = FastAPI()
    app.include_router(claims_mod.router)
    return TestClient(app)


def _h(pid: int) -> dict[str, str]:
    return {"X-Player-Id": str(pid)}


# ── Healthz ──────────────────────────────────────────────────────


def test_healthz_remains_open(wired):
    resp = wired["client"].get("/api/claims/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ── Feature flag ──────────────────────────────────────────────────


def test_claim_create_blocked_when_flag_off(flag_off):
    resp = flag_off.post("/api/claims/500", headers=_h(100), json={"note": "x"})
    assert resp.status_code == 503


def test_release_blocked_when_flag_off(flag_off):
    resp = flag_off.delete("/api/claims/500", headers=_h(100))
    assert resp.status_code == 503


def test_stream_blocked_when_flag_off(flag_off):
    resp = flag_off.get("/api/claims/stream", headers=_h(100))
    assert resp.status_code == 503


# ── Create ───────────────────────────────────────────────────────


def test_create_claim_returns_201_and_publishes(wired):
    client, published = wired["client"], wired["published"]
    resp = client.post("/api/claims/500", headers=_h(100), json={"note": "on it"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["target_id"] == 500
    assert body["claimer_id"] == 100
    assert body["claimer_name"] == "Alice"
    assert body["status"] == "active"
    assert body["note"] == "on it"
    # expires_at − claimed_at must be exactly the locked 15-minute TTL.
    assert body["expires_at"] - body["claimed_at"] == 900
    # One event was published with the right type.
    assert any(t == "claim.created" for t, _ in published)


def test_create_claim_duplicate_returns_409_with_existing(wired):
    client, published = wired["client"], wired["published"]
    client.post("/api/claims/500", headers=_h(100), json={})
    published.clear()
    resp = client.post("/api/claims/500", headers=_h(200), json={"note": "mine"})
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["detail"] == "already claimed"
    assert detail["claim"]["claimer_id"] == 100  # original claimer wins
    assert detail["claim"]["claimer_name"] == "Alice"
    # 409 must not publish a new event — nothing changed.
    assert published == []


def test_create_claim_rejects_missing_member(wired):
    resp = wired["client"].post("/api/claims/500", headers=_h(42), json={})
    assert resp.status_code == 401


def test_create_claim_rejects_invalid_target(wired):
    resp = wired["client"].post("/api/claims/-1", headers=_h(100), json={})
    # negative ints still parse as int → handler rejects them.
    assert resp.status_code == 400


# ── Release ──────────────────────────────────────────────────────


def test_release_by_owner_succeeds_and_publishes(wired):
    client, published = wired["client"], wired["published"]
    client.post("/api/claims/500", headers=_h(100), json={})
    published.clear()
    resp = client.delete("/api/claims/500", headers=_h(100))
    assert resp.status_code == 200
    assert resp.json()["status"] == "released"
    assert any(t == "claim.released" for t, _ in published)


def test_release_by_non_owner_returns_403(wired):
    client = wired["client"]
    client.post("/api/claims/500", headers=_h(100), json={})
    resp = client.delete("/api/claims/500", headers=_h(200))
    assert resp.status_code == 403
    # And the claim survives unchanged.
    assert wired["repo"].get(500)["status"] == "active"


def test_release_by_admin_succeeds(wired):
    client = wired["client"]
    client.post("/api/claims/500", headers=_h(100), json={})
    resp = client.delete("/api/claims/500", headers=_h(999))
    assert resp.status_code == 200
    assert wired["repo"].get(500)["status"] == "released"


def test_release_missing_claim_returns_404(wired):
    resp = wired["client"].delete("/api/claims/500", headers=_h(100))
    assert resp.status_code == 404


# ── Mark hit ─────────────────────────────────────────────────────


def test_mark_hit_by_owner_succeeds(wired):
    client, published = wired["client"], wired["published"]
    client.post("/api/claims/500", headers=_h(100), json={})
    published.clear()
    resp = client.post("/api/claims/500/hit", headers=_h(100))
    assert resp.status_code == 200
    assert resp.json()["status"] == "hit"
    assert any(t == "claim.hit" for t, _ in published)


def test_mark_hit_by_non_owner_returns_403_even_for_admin(wired):
    client = wired["client"]
    client.post("/api/claims/500", headers=_h(100), json={})
    resp = client.post("/api/claims/500/hit", headers=_h(999))
    # Admins can release a claim but not steal kill credit.
    assert resp.status_code == 403


# ── Active list ──────────────────────────────────────────────────


def test_list_active_filters_to_faction_members(wired):
    client = wired["client"]
    client.post("/api/claims/501", headers=_h(100), json={})
    client.post("/api/claims/502", headers=_h(200), json={})
    resp = client.get("/api/claims/active", headers=_h(100))
    assert resp.status_code == 200
    payload = resp.json()
    target_ids = sorted(c["target_id"] for c in payload["claims"])
    assert target_ids == [501, 502]
    # Each entry carries the resolved claimer_name.
    names = {c["claimer_id"]: c["claimer_name"] for c in payload["claims"]}
    assert names == {100: "Alice", 200: "Bob"}
