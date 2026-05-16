"""Tests for the 60s claims sweeper job."""
from __future__ import annotations

import os
from unittest.mock import MagicMock

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.claims import ClaimRepository
from api.routers import claims as claims_mod
from api.scheduler.jobs import claims_sweeper as sweeper_mod


class StubKeyStore:
    def __init__(self, members: dict[int, str]):
        self._members = members

    def get_key(self, player_id: int):
        name = self._members.get(player_id)
        if name is None:
            return None
        return {"player_id": player_id, "player_name": name}


@pytest.fixture
def wired_sweeper(tmp_path, monkeypatch):
    db_path = str(tmp_path / "claims.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    repo = ClaimRepository(db_path=db_path)
    ks = StubKeyStore({100: "Alice", 200: "Bob"})
    captured: list[tuple[dict, int]] = []

    mgr = MagicMock()

    async def _publish(event, faction_id):  # noqa: ANN001
        captured.append((event, faction_id))

    mgr.publish = _publish

    monkeypatch.setattr(claims_mod, "claim_repo", repo)
    monkeypatch.setattr(claims_mod, "claim_manager", mgr)
    monkeypatch.setattr(claims_mod, "key_store", ks)
    # ENABLE_HIT_CALLING lives on api.config — the sweeper reads it via
    # a late import, so we patch both the source and any already-bound copies.
    monkeypatch.setattr("api.config.ENABLE_HIT_CALLING", True)
    return {"repo": repo, "captured": captured}


async def test_sweeper_expires_past_due_and_publishes_per_row(wired_sweeper):
    import time

    repo = wired_sweeper["repo"]
    captured = wired_sweeper["captured"]
    # Use a realistic now so the sweeper (which reads time.time()) sees row #3
    # as still fresh — anchoring at an old epoch would make every TTL expire.
    now = int(time.time())
    repo.claim(target_id=1, claimer_id=100, now=now - 1_000, ttl_seconds=10)
    repo.claim(target_id=2, claimer_id=200, now=now - 1_000, ttl_seconds=10)
    repo.claim(target_id=3, claimer_id=100, now=now, ttl_seconds=10_000)
    await sweeper_mod.run_claims_sweeper.__wrapped__()
    assert repo.get(1)["status"] == "expired"
    assert repo.get(2)["status"] == "expired"
    assert repo.get(3)["status"] == "active"
    # One published event per flipped row, carrying claim.expired + claimer_name.
    types = [evt["type"] for evt, _ in captured]
    assert types.count("claim.expired") == 2
    names = sorted(evt["claim"]["claimer_name"] for evt, _ in captured)
    assert names == ["Alice", "Bob"]


async def test_sweeper_idempotent_when_nothing_to_expire(wired_sweeper):
    import time

    repo = wired_sweeper["repo"]
    repo.claim(target_id=1, claimer_id=100, now=int(time.time()), ttl_seconds=10_000)
    await sweeper_mod.run_claims_sweeper.__wrapped__()
    await sweeper_mod.run_claims_sweeper.__wrapped__()
    assert repo.get(1)["status"] == "active"
    assert wired_sweeper["captured"] == []


async def test_sweeper_skips_when_flag_off(wired_sweeper, monkeypatch):
    import time

    repo = wired_sweeper["repo"]
    repo.claim(target_id=1, claimer_id=100, now=int(time.time()) - 1_000, ttl_seconds=10)
    monkeypatch.setattr("api.config.ENABLE_HIT_CALLING", False)
    await sweeper_mod.run_claims_sweeper.__wrapped__()
    # Flag-off → no DB churn, no publishes. Row stays active despite being past-due.
    assert repo.get(1)["status"] == "active"
    assert wired_sweeper["captured"] == []


async def test_sweeper_leaves_non_active_rows_untouched(wired_sweeper):
    import time

    repo = wired_sweeper["repo"]
    now = int(time.time())
    repo.claim(target_id=1, claimer_id=100, now=now - 1_000, ttl_seconds=10)
    repo.mark_hit(target_id=1, claimer_id=100, now=now - 995)
    await sweeper_mod.run_claims_sweeper.__wrapped__()
    assert repo.get(1)["status"] == "hit"
    assert wired_sweeper["captured"] == []
