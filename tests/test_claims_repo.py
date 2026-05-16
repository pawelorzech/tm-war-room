"""Smoke tests for ClaimRepository (Phase 0)."""
import os

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.claims import ClaimRepository


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return ClaimRepository(db_path=db_path)


def test_claim_fresh_target_returns_ok(repo):
    status, row = repo.claim(target_id=500, claimer_id=100, now=1_000, ttl_seconds=600, note="on it")
    assert status == "ok"
    assert row["claimer_id"] == 100
    assert row["status"] == "active"
    assert row["claimed_at"] == 1_000
    assert row["expires_at"] == 1_600
    assert row["note"] == "on it"


def test_claim_conflict_returns_existing_row(repo):
    repo.claim(target_id=500, claimer_id=100, now=1_000, ttl_seconds=600)
    status, row = repo.claim(target_id=500, claimer_id=200, now=1_100, ttl_seconds=600)
    assert status == "conflict"
    # Original claimer still owns it.
    assert row["claimer_id"] == 100
    assert row["status"] == "active"


def test_claim_after_release_reclaims(repo):
    repo.claim(target_id=500, claimer_id=100, now=1_000, ttl_seconds=600)
    assert repo.release(target_id=500, claimer_id=100, now=1_100) is True
    status, row = repo.claim(target_id=500, claimer_id=200, now=1_200, ttl_seconds=600)
    assert status == "ok"
    assert row["claimer_id"] == 200
    assert row["status"] == "active"


def test_claim_after_expiry_reclaims(repo):
    repo.claim(target_id=500, claimer_id=100, now=1_000, ttl_seconds=60)
    # Same call with now past expiry — should win.
    status, row = repo.claim(target_id=500, claimer_id=200, now=2_000, ttl_seconds=600)
    assert status == "ok"
    assert row["claimer_id"] == 200


def test_release_rejects_non_owner(repo):
    repo.claim(target_id=500, claimer_id=100, now=1_000, ttl_seconds=600)
    assert repo.release(target_id=500, claimer_id=999, now=1_100) is False
    row = repo.get(500)
    assert row["status"] == "active"
    assert row["claimer_id"] == 100


def test_mark_hit_only_works_on_active_owner_claim(repo):
    repo.claim(target_id=500, claimer_id=100, now=1_000, ttl_seconds=600)
    assert repo.mark_hit(target_id=500, claimer_id=999, now=1_100) is False
    assert repo.mark_hit(target_id=500, claimer_id=100, now=1_100) is True
    assert repo.get(500)["status"] == "hit"


def test_expire_stale_flips_only_active_overdue(repo):
    repo.claim(target_id=1, claimer_id=100, now=1_000, ttl_seconds=10)
    repo.claim(target_id=2, claimer_id=100, now=1_000, ttl_seconds=10_000)
    repo.claim(target_id=3, claimer_id=100, now=1_000, ttl_seconds=10)
    # Mark target 3 hit, so expire_stale should leave it alone even though TTL elapsed.
    repo.mark_hit(target_id=3, claimer_id=100, now=1_005)
    flipped = repo.expire_stale(now=5_000)
    # Phase 4A changed the return type from `int` to `list[dict]` so the
    # sweeper can publish a per-row event without a follow-up SELECT.
    assert len(flipped) == 1
    assert flipped[0]["target_id"] == 1
    assert flipped[0]["status"] == "expired"
    assert flipped[0]["claimer_id"] == 100
    assert repo.get(1)["status"] == "expired"
    assert repo.get(2)["status"] == "active"
    assert repo.get(3)["status"] == "hit"


def test_expire_stale_empty_returns_empty_list(repo):
    repo.claim(target_id=1, claimer_id=100, now=1_000, ttl_seconds=10_000)
    flipped = repo.expire_stale(now=1_500)
    assert flipped == []
    assert repo.get(1)["status"] == "active"


def test_active_claims_for_faction_filters_by_member_ids(repo):
    repo.claim(target_id=1, claimer_id=100, now=1_000, ttl_seconds=600)
    repo.claim(target_id=2, claimer_id=200, now=2_000, ttl_seconds=600)
    repo.claim(target_id=3, claimer_id=300, now=3_000, ttl_seconds=600)
    repo.release(target_id=2, claimer_id=200, now=2_500)

    visible = repo.active_claims_for_faction([100, 200])
    target_ids = {r["target_id"] for r in visible}
    assert target_ids == {1}  # 2 is released, 300 not in faction


def test_active_claims_for_faction_empty_input_short_circuits(repo):
    repo.claim(target_id=1, claimer_id=100, now=1_000, ttl_seconds=600)
    assert repo.active_claims_for_faction([]) == []


def test_active_claims_lists_only_active(repo):
    repo.claim(target_id=1, claimer_id=100, now=1_000, ttl_seconds=600)
    repo.claim(target_id=2, claimer_id=100, now=2_000, ttl_seconds=600)
    repo.release(target_id=1, claimer_id=100, now=1_500)
    rows = repo.active_claims()
    assert len(rows) == 1
    assert rows[0]["target_id"] == 2
