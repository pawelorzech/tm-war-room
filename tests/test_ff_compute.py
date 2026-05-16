"""Unit tests for api.ff.compute_ff — FFScouter parity Phase 1A.

These tests pin the FFScouter formula + source attribution + dom_stat
selection. We mock the spy service / stats repo / torn client at module
boundary so the function never makes a real HTTP call.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.requests import Request

from api.ff import (
    _dom_stat_from_personalstats,
    _dom_stat_from_spy,
    _ff_formula,
    compute_ff,
)


def _stub_request(headers: dict[str, str] | None = None) -> Request:
    """Build a minimal Starlette Request usable in direct-call unit tests.
    The ETag helper only reads request.headers, so the scope can be sparse."""
    h = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "method": "GET", "headers": h})


def _mock_torn_client(personalstats: dict | None = None, level: int = 50, age: int = 1000):
    """Build a torn_client mock that pretends GET /user/{id} returned PS data."""
    tc = MagicMock()
    tc._api_key = "stub"
    # fetch_training_data returns the CALLER's real battlestats; tests
    # override this per-case.
    tc.fetch_training_data = AsyncMock(return_value=None)
    resp = MagicMock()
    resp.status_code = 200
    resp.json = MagicMock(
        return_value={
            "personalstats": personalstats or {},
            "level": level,
            "age": age,
        }
    )
    tc._http = MagicMock()
    tc._http.get = AsyncMock(return_value=resp)
    return tc


def _mock_key_store(player_id: int | None = None, api_key: str = "caller-key"):
    """key_store.get_key returns a registered key (or None)."""
    store = MagicMock()
    if player_id is None:
        store.get_key.return_value = None
    else:
        store.get_key.return_value = {"player_id": player_id, "api_key": api_key, "player_name": "Me"}
    return store


def _mock_spy_service(player_id: int, estimate: dict | None):
    """spy_service.repo.get_estimate(pid) → estimate."""
    svc = MagicMock()
    svc.repo = MagicMock()
    svc.repo.get_estimate = MagicMock(return_value=estimate)
    return svc


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_ff_formula_caller_equal_target_returns_about_1_89():
    # FF = 1 + 8/9 * (1.0) ≈ 1.889
    assert _ff_formula(target_total=1_000_000, caller_total=1_000_000) == pytest.approx(1.889, abs=0.01)


def test_ff_formula_target_zero_clamps_to_one():
    assert _ff_formula(target_total=0, caller_total=1_000_000) == 1.0


def test_ff_formula_caller_zero_does_not_divide_by_zero():
    # Caller 0 is treated as 1 — score is huge but defined.
    score = _ff_formula(target_total=100, caller_total=0)
    assert score > 1.0
    assert score == pytest.approx(1 + 8 / 9 * 100, abs=0.01)


def test_dom_stat_from_spy_picks_largest():
    est = {"strength": 100, "defense": 200, "speed": 50, "dexterity": 75}
    assert _dom_stat_from_spy(est) == "DEF"


def test_dom_stat_from_spy_tie_break_prefers_strength():
    # All equal — STR wins by stable tie-break order.
    est = {"strength": 100, "defense": 100, "speed": 100, "dexterity": 100}
    assert _dom_stat_from_spy(est) == "STR"


def test_dom_stat_from_personalstats_attacks_won_dominant():
    # attackswon high, nothing else → DEX
    ps = {"attackswon": 5000, "defendswon": 10, "attacksstealthed": 0}
    assert _dom_stat_from_personalstats(ps) == "DEX"


def test_dom_stat_from_personalstats_empty_defaults_to_str():
    # No counters → fall through to STR (stable default).
    assert _dom_stat_from_personalstats({}) == "STR"


# ---------------------------------------------------------------------------
# compute_ff — spy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_ff_uses_spy_when_present():
    spy_est = {
        "strength": 100_000_000, "defense": 100_000_000,
        "speed": 100_000_000, "dexterity": 100_000_000,
        "total": 400_000_000,
    }
    svc = _mock_spy_service(player_id=42, estimate=spy_est)
    # Caller has a registered key → real battlestats from fetch_training_data.
    tc = _mock_torn_client()
    tc.fetch_training_data = AsyncMock(return_value={
        "battlestats": {"strength": 100_000_000, "defense": 100_000_000,
                        "speed": 100_000_000, "dexterity": 100_000_000},
    })
    ks = _mock_key_store(player_id=1)

    result = await compute_ff(
        player_id=42, caller_id=1,
        torn_client=tc, key_store=ks,
        spy_service=svc, stats_repo=None, now=1_000,
    )

    assert result["source"] == "spy"
    # target_total == caller_total → score ≈ 1.889
    assert result["score"] == pytest.approx(1.889, abs=0.01)
    assert result["dom_stat"] == "STR"  # tie-break
    assert result["computed_at"] == 1_000
    assert result["expires_at"] > 1_000


@pytest.mark.asyncio
async def test_compute_ff_spy_estimate_with_zero_total_falls_through_to_formula():
    # A spy_estimates row exists but total=0 (placeholder) — must NOT count
    # as a real spy. Should fall through to the formula path.
    spy_est = {"strength": 0, "defense": 0, "speed": 0, "dexterity": 0, "total": 0}
    svc = _mock_spy_service(player_id=42, estimate=spy_est)
    tc = _mock_torn_client(personalstats={"xantaken": 100, "attackswon": 500})
    ks = _mock_key_store(player_id=None)

    result = await compute_ff(
        player_id=42, caller_id=1,
        torn_client=tc, key_store=ks,
        spy_service=svc, stats_repo=None,
    )
    assert result["source"] == "formula"


@pytest.mark.asyncio
async def test_compute_ff_uses_faction_snapshot_when_no_spy():
    # No spy, but stat_snapshots has exact stats (faction member).
    stats_repo = MagicMock()
    stats_repo.get_latest_snapshot = MagicMock(return_value={
        "strength": 50_000_000, "defense": 25_000_000,
        "speed": 10_000_000, "dexterity": 15_000_000,
        "total": 100_000_000,
    })
    svc = _mock_spy_service(player_id=42, estimate=None)
    tc = _mock_torn_client()
    tc.fetch_training_data = AsyncMock(return_value={
        "battlestats": {"strength": 50_000_000, "defense": 50_000_000,
                        "speed": 50_000_000, "dexterity": 50_000_000},
    })
    ks = _mock_key_store(player_id=1)

    result = await compute_ff(
        player_id=42, caller_id=1,
        torn_client=tc, key_store=ks,
        spy_service=svc, stats_repo=stats_repo,
    )

    assert result["source"] == "spy"
    assert result["dom_stat"] == "STR"  # snapshot has STR=50M dominant


# ---------------------------------------------------------------------------
# compute_ff — formula path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_ff_falls_back_to_formula_when_no_spy():
    # No spy_service, no stats_repo — pure formula path.
    tc = _mock_torn_client(personalstats={
        "xantaken": 500, "refills": 100,
        "attackswon": 5000, "defendswon": 100,
    })
    ks = _mock_key_store(player_id=None)

    result = await compute_ff(
        player_id=42, caller_id=1,
        torn_client=tc, key_store=ks,
        spy_service=None, stats_repo=None,
    )

    assert result["source"] == "formula"
    assert result["score"] >= 1.0
    assert result["dom_stat"] in ("STR", "DEF", "SPD", "DEX")


@pytest.mark.asyncio
async def test_compute_ff_handles_torn_api_failure_gracefully():
    # Torn API returns 500 — must not raise, just return floor score.
    tc = MagicMock()
    tc._api_key = "stub"
    tc.fetch_training_data = AsyncMock(return_value=None)
    bad_resp = MagicMock()
    bad_resp.status_code = 500
    tc._http = MagicMock()
    tc._http.get = AsyncMock(return_value=bad_resp)
    ks = _mock_key_store(player_id=None)

    result = await compute_ff(
        player_id=42, caller_id=1,
        torn_client=tc, key_store=ks,
        spy_service=None, stats_repo=None,
    )

    # Both totals are 0 → caller treated as 1 → score = 1 + 0 = 1.0
    assert result["source"] == "formula"
    assert result["score"] == 1.0


# ---------------------------------------------------------------------------
# Cache short-circuit (router level)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_router_cache_hit_short_circuits_compute(monkeypatch):
    """Fresh ff_scores row → router returns cached value WITHOUT touching
    compute_ff or Torn API. Verifies the cache check actually fires."""
    import api.routers.ff as ff_mod

    # Patch compute_ff to blow up if called.
    called = {"compute": 0}

    async def _explode(**_kwargs):
        called["compute"] += 1
        raise AssertionError("compute_ff should not run on cache hit")

    monkeypatch.setattr(ff_mod, "compute_ff", _explode)
    monkeypatch.setattr("api.routers.ff.ENABLE_FF_SCORE", True)

    ff_repo = MagicMock()
    # Cached row that won't expire for an hour.
    import time as _time

    now = int(_time.time())
    ff_repo.get.return_value = {
        "score": 1.5, "dom_stat": "DEX", "source": "spy",
        "computed_at": now - 60, "expires_at": now + 3600,
    }
    monkeypatch.setattr(ff_mod, "ff_repo", ff_repo)
    monkeypatch.setattr(ff_mod, "torn_client", MagicMock())
    monkeypatch.setattr(ff_mod, "key_store", MagicMock())

    result = await ff_mod.get_ff_score(player_id=42, request=_stub_request(), x_player_id=1)
    body = json.loads(result.body)
    assert body["score"] == 1.5
    assert body["dom_stat"] == "DEX"
    assert called["compute"] == 0


@pytest.mark.asyncio
async def test_router_cache_expired_triggers_recompute(monkeypatch):
    import api.routers.ff as ff_mod

    monkeypatch.setattr("api.routers.ff.ENABLE_FF_SCORE", True)

    fake_now = 1_700_000_000
    monkeypatch.setattr("api.routers.ff.time.time", lambda: fake_now)

    ff_repo = MagicMock()
    # Expired row → expires_at < now.
    ff_repo.get.return_value = {
        "score": 1.5, "dom_stat": "DEX", "source": "spy",
        "computed_at": fake_now - 10_000, "expires_at": fake_now - 1,
    }

    async def _fake_compute(**_kw):
        return {
            "score": 2.0, "dom_stat": "STR", "source": "formula",
            "computed_at": fake_now, "expires_at": fake_now + 21_600,
        }

    monkeypatch.setattr(ff_mod, "compute_ff", _fake_compute)
    monkeypatch.setattr(ff_mod, "ff_repo", ff_repo)
    monkeypatch.setattr(ff_mod, "torn_client", MagicMock())
    monkeypatch.setattr(ff_mod, "key_store", MagicMock())

    result = await ff_mod.get_ff_score(player_id=42, request=_stub_request(), x_player_id=1)
    body = json.loads(result.body)

    assert body["score"] == 2.0
    assert body["source"] == "formula"
    ff_repo.upsert.assert_called_once()
