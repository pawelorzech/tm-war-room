"""OpenAPI-schema contract tests for Companion-touched endpoints.

What this guards
================

The TM Hub Companion userscript ships one version to every user via
Greasy Fork. We can't roll out a backwards-incompatible response shape
change to "all consumers running v1.x" first — every user hits master
the moment we deploy. So we need the inverse contract: pin the backend's
response shape with a checked-in snapshot, and assert on every CI run
that it hasn't drifted.

If a router intentionally changes shape, the author bumps the snapshot
in the same PR — visible in code review. If a router accidentally
changes shape, CI fails before users do.

Why not Pact
============

Pact assumes versioned consumers ("Pact broker says v1.2 of the
Companion expects shape X; v1.3 expects shape Y"). We don't have
that — there's exactly one in-flight Companion at any moment. Pact
is the wrong tool for "one consumer, many producers"; snapshot
contracts are the right tool.

How drift is reported
=====================

`jsonschema.validate` raises `ValidationError` with a clear path
("$.bounties[0].threat_score" — wrong type). pytest's `tb=short`
shows it inline, which is more actionable than "expected dict, got
list" with no field name.

What's in scope
===============

Endpoints listed in `extension/docs/perf-baseline.md` section
"Backend latency baseline" that the Companion actually reads or
writes. Endpoints we couldn't stub cheaply (those needing a full
DB + scheduler + Torn client) are snapshotted as documentation but
their validation test is skipped with an explicit reason.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, ValidationError

SNAPSHOT_DIR = Path(__file__).parent / "contracts" / "snapshots"


# ---------- snapshot discovery ----------


def _load_snapshots() -> dict[str, dict]:
    """Load every snapshot in tests/contracts/snapshots/.

    The snapshot file's stem (e.g. ``wars_current``) is the test id used
    by pytest's parametrize so a failed test shows the offending endpoint
    by name.
    """
    if not SNAPSHOT_DIR.is_dir():
        return {}
    out: dict[str, dict] = {}
    for path in sorted(SNAPSHOT_DIR.glob("*.json")):
        with path.open() as fh:
            out[path.stem] = json.load(fh)
    return out


SNAPSHOTS = _load_snapshots()
# Snapshot id → (build_client_fn, request_fn). Endpoints we couldn't stub
# cheaply are absent here; the parametrized test skips them with a clear
# reason rather than silently passing.
_HANDLERS: dict[str, callable] = {}


def _register(snapshot_id: str):
    """Decorator to register a contract-validation handler.

    Each handler returns the JSON response body that we'll validate
    against the snapshot. Raising ``pytest.skip`` is a legitimate
    outcome — see the spy_player handler for why.
    """

    def deco(fn):
        _HANDLERS[snapshot_id] = fn
        return fn

    return deco


# ---------- shared stubs ----------


def _mock_key_store(player_id: int = 123) -> MagicMock:
    """Stub matching the shape api/routers/*.py reads from key_store.

    Mirrors tests/test_wars_routes.py:mock_store so we stay consistent
    with the rest of the suite — drift here would be its own contract
    violation (between test suites this time).
    """
    store = MagicMock()
    registered = {
        player_id: {
            "player_id": player_id,
            "player_name": "Test",
            "api_key": "fake_key",
            "is_faction_key": False,
        },
    }
    store.get_all_keys.return_value = list(registered.values())
    store.get_key.side_effect = lambda pid: registered.get(pid)
    store.has_key.side_effect = lambda pid: pid in registered
    store.is_admin = MagicMock(return_value=False)
    return store


def _single_router_client(router) -> TestClient:
    """Mount a single router on a bare FastAPI app — no global auth middleware.

    The auth middleware lives in api.main and is tested separately. For
    contract tests we care about the router's response shape, not the
    transport-level guard.
    """
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


# ---------- handlers (one per snapshot) ----------


@_register("extension_feature_flags")
def _h_extension_feature_flags(monkeypatch) -> dict:
    from api.routers import extension as mod

    client = _single_router_client(mod.router)
    resp = client.get("/api/extension/feature-flags")
    assert resp.status_code == 200, resp.text
    return resp.json()


@_register("wars_current")
def _h_wars_current(monkeypatch) -> dict:
    """At-war path: opponent present, all fields set."""
    from api.models import WarFaction, WarStatus
    from api.routers import wars as mod

    war = WarStatus(
        war_id=42,
        start=1_700_000_000,
        end=1_700_100_000,
        target=5000,
        winner=None,
        factions=[
            WarFaction(id=11559, name="The Masters", score=5100, chain=100),
            WarFaction(id=9999, name="Rivals", score=4800, chain=80),
        ],
    )
    mock_client = AsyncMock()
    mock_client.fetch_war = AsyncMock(return_value=war)
    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "FACTION_ID", 11559)

    client = _single_router_client(mod.router)
    resp = client.get("/api/wars/current")
    assert resp.status_code == 200, resp.text
    return resp.json()


@_register("war_off_limits")
def _h_war_off_limits(tmp_path, monkeypatch) -> dict:
    """In-DB entries → list_for_war returns one row, count = 1."""
    from api.db.migrations.runner import run_migrations
    from api.db.repos.war_off_limits import WarOffLimitsRepository
    from api.routers import war_off_limits as mod

    db_path = str(tmp_path / "contract.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    repo = WarOffLimitsRepository(db_path=db_path)
    repo.add(
        war_id=777, player_id=42, player_name="EnemyGuy",
        set_by=100, set_by_name="Owner", reason="med-out",
    )

    class _Store:
        def has_key(self, pid: int) -> bool:
            return pid == 100

        def is_admin(self, pid: int) -> bool:
            return False

        def get_key(self, pid: int):
            return {"player_id": 100, "player_name": "Owner"} if pid == 100 else None

    monkeypatch.setattr(mod, "repo", repo)
    monkeypatch.setattr(mod, "key_store", _Store())

    client = _single_router_client(mod.router)
    resp = client.get("/api/war-off-limits/777", headers={"X-Player-Id": "100"})
    assert resp.status_code == 200, resp.text
    return resp.json()


@_register("ff_player")
def _h_ff_player(monkeypatch) -> dict:
    """Cache hit short-circuit — deterministic numbers, no compute path."""
    from api.routers import ff as mod

    monkeypatch.setattr("api.routers.ff.ENABLE_FF_SCORE", True)
    ff_repo = MagicMock()
    ff_repo.get.return_value = {
        "score": 1.7,
        "dom_stat": "DEF",
        "source": "spy",
        "computed_at": 1_700_000_000,
        "expires_at": 9_999_999_999,
    }
    monkeypatch.setattr(mod, "ff_repo", ff_repo)
    monkeypatch.setattr(mod, "torn_client", MagicMock())
    monkeypatch.setattr(mod, "key_store", MagicMock())

    client = _single_router_client(mod.router)
    resp = client.get("/api/ff/42", headers={"X-Player-Id": "1"})
    assert resp.status_code == 200, resp.text
    return resp.json()


@_register("ff_bulk")
def _h_ff_bulk(monkeypatch) -> dict:
    """One id in the body, served from a warm cache."""
    from api.routers import ff as mod

    monkeypatch.setattr("api.routers.ff.ENABLE_FF_SCORE", True)
    ff_repo = MagicMock()
    ff_repo.get.return_value = {
        "score": 2.1,
        "dom_stat": "STR",
        "source": "spy",
        "computed_at": 1_700_000_000,
        "expires_at": 9_999_999_999,
    }
    monkeypatch.setattr(mod, "ff_repo", ff_repo)
    monkeypatch.setattr(mod, "torn_client", MagicMock())
    monkeypatch.setattr(mod, "key_store", MagicMock())

    client = _single_router_client(mod.router)
    resp = client.post(
        "/api/ff/bulk",
        json={"player_ids": [42]},
        headers={"X-Player-Id": "1"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@_register("loot")
def _h_loot(monkeypatch) -> dict:
    """Stub TornStats response with two NPCs at different levels."""
    from api.routers import loot as mod

    class _FakeResp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            # NPC data is keyed by NPC id at the top level (see router).
            return {
                "status": True,
                "4": {
                    "name": "Duke",
                    "status": "Okay",
                    "hosp_out": 1_700_000_000,
                    "updated": 1_700_000_500,
                },
                "5": {
                    "name": "Easter Bunny",
                    "status": "Hospital",
                    "hosp_out": 1_700_010_000,
                    "updated": 1_700_010_500,
                },
            }

    http = AsyncMock()
    http.get = AsyncMock(return_value=_FakeResp())
    mock_client = MagicMock()
    mock_client._http = http
    mock_client._api_key = "test"
    monkeypatch.setattr(mod, "torn_client", mock_client)
    monkeypatch.setattr(mod, "tornstats_key", "ts_key")
    # No reservations table needed — pass a stub with empty list.
    repo = MagicMock()
    repo.get_all.return_value = []
    monkeypatch.setattr(mod, "reservation_repo", repo)
    # Wipe the module-level cache so we hit the live fetch path.
    monkeypatch.setattr(mod, "_cache", None)
    monkeypatch.setattr(mod, "_cache_ts", 0)

    client = _single_router_client(mod.router)
    resp = client.get("/api/loot")
    assert resp.status_code == 200, resp.text
    return resp.json()


@_register("companion_rum")
def _h_companion_rum(monkeypatch) -> Any:
    """204 No Content. Returns None (no JSON body) so the validator
    handles ``"type": "null"``.

    The RUM endpoint is rate-limited to 1 req/min/IP via a process-global
    ``rate_limiter``. We clear it both before AND after the request so this
    test neither bleeds prior state in nor leaks consumed budget out.

    NB: ``tests/test_activity_route.py::test_track_rate_limit_returns_429``
    permanently REASSIGNS ``api.auth.rate_limiter`` to a fresh instance
    mid-suite, so by the time we get here ``auth.rate_limiter`` may no
    longer be the same object that the router captured at import time.
    Reach into the router's own captured reference to clear the right
    bucket regardless of test ordering.
    """
    from api.routers import companion_rum as mod

    mod.rate_limiter._local._requests.clear()
    try:
        client = _single_router_client(mod.router)
        resp = client.post(
            "/api/companion/rum",
            json={
                "v": "0.27.2",
                "page_kind": "profile",
                "tti_ms": 100,
                "tbt_ms": 10,
                "fcp_ms": 200,
                "longtask_count": 0,
                "polls_per_min_visible": 0,
                "polls_per_min_hidden": 0,
                "errors": 0,
                "ts": "2026-05-17T10:00:00Z",
            },
        )
        assert resp.status_code == 204, resp.text
        assert resp.content == b"", "RUM endpoint must not echo the payload back"
        return None
    finally:
        mod.rate_limiter._local._requests.clear()


# ---------- snapshots intentionally skipped (documentation only) ----------
# These endpoints are too entangled with live Torn / YATA / TornStats fetches
# to stub cheaply; their snapshots stand as documentation, while drift
# detection waits on either a real-traffic capture or a Torn-client double
# rich enough to drive them. Until then, the test is skipped with a
# clear reason so nobody mistakes "no failure" for "shape verified".

_SKIP_REASONS = {
    "spy_player": (
        "requires a SpyService backed by a populated SQLite DB plus a "
        "torn_client that returns 200 from api.torn.com/user/{id}; both "
        "are non-trivial to stub. Snapshot kept as the canonical "
        "Companion-facing shape."
    ),
    "travel": (
        "requires YATA travel-stocks fetch + Torn items selection. "
        "Snapshot documents the merged shape Companion expects."
    ),
    "market_prices": (
        "requires the full Torn items selection (~1600 items) plus the "
        "YATA abroad map. Snapshot documents the items[] entry shape."
    ),
    "stocks_portfolio": (
        "requires fetch_stock_market + fetch_user_stocks doubles plus a "
        "key_store with a registered player. Existing test_stocks_routes.py "
        "covers the happy-path shape; snapshot is the contract version."
    ),
    "bounties": (
        "requires fetch_bounties + fetch_personalstats + spy_service "
        "wiring to produce a non-empty list. Snapshot documents the per-"
        "entry shape; behaviour is covered by tests/test_bounties.py."
    ),
}


# ---------- driver ----------


def test_snapshots_directory_is_populated():
    """RED-first: if the snapshots dir is missing or empty the whole
    contract-test idea is silently a no-op. Fail loudly."""
    assert SNAPSHOT_DIR.is_dir(), f"Missing snapshots dir: {SNAPSHOT_DIR}"
    assert SNAPSHOTS, (
        "No snapshots discovered. Add JSON files under "
        f"{SNAPSHOT_DIR} or this test suite proves nothing."
    )


def test_every_snapshot_has_handler_or_skip_reason():
    """Catch the silent-pass failure mode: an unhandled snapshot with no
    skip reason would report as 'passed' without ever running. Fail loud."""
    orphans = [
        sid for sid in SNAPSHOTS
        if sid not in _HANDLERS and sid not in _SKIP_REASONS
    ]
    assert not orphans, (
        f"Snapshot(s) without a handler or a documented skip reason: "
        f"{orphans}. Either register a handler in _HANDLERS or add an "
        f"entry to _SKIP_REASONS explaining why."
    )


def _validator_for(snapshot: dict) -> Draft202012Validator:
    """The validator drops the documentation-only keys we carry alongside
    the schema body. ``endpoint`` and ``description`` are for humans;
    ``status_code`` is read by the RUM handler separately.

    Validating with the documentation keys left in would not actually
    break anything — Draft 2020-12 ignores unknown keywords — but
    stripping them keeps `tb=short` output tight."""
    schema = {k: v for k, v in snapshot.items()
              if k not in {"endpoint", "description", "status_code"}}
    return Draft202012Validator(schema)


@pytest.mark.parametrize("snapshot_id", sorted(SNAPSHOTS.keys()))
def test_response_matches_snapshot(snapshot_id, monkeypatch, tmp_path):
    """Drive each handler, validate its response against the snapshot.

    Failure mode: ``jsonschema.ValidationError`` with a path pointing at
    the offending field. That's the diff the change author needs to see
    in CI output.
    """
    snapshot = SNAPSHOTS[snapshot_id]

    if snapshot_id in _SKIP_REASONS:
        pytest.skip(_SKIP_REASONS[snapshot_id])

    handler = _HANDLERS.get(snapshot_id)
    if handler is None:
        # Should be caught by test_every_snapshot_has_handler_or_skip_reason,
        # but defend in depth — better an explicit skip than a silent pass.
        pytest.skip(f"No handler registered for {snapshot_id}")

    # Hand the handler whichever fixtures it asks for. Inspecting the
    # signature keeps each handler's surface minimal — most don't need
    # tmp_path, only war_off_limits does.
    import inspect

    sig = inspect.signature(handler)
    kwargs = {}
    if "monkeypatch" in sig.parameters:
        kwargs["monkeypatch"] = monkeypatch
    if "tmp_path" in sig.parameters:
        kwargs["tmp_path"] = tmp_path

    body = handler(**kwargs)

    validator = _validator_for(snapshot)
    errors = sorted(validator.iter_errors(body), key=lambda e: e.path)
    if errors:
        # Produce a focused diff — one line per offending path. Beats the
        # default ValidationError repr that dumps the whole instance.
        lines = [
            f"{snapshot_id}: response drifted from snapshot",
            f"  endpoint: {snapshot.get('endpoint', '?')}",
            "",
        ]
        for err in errors:
            path = ".".join(str(p) for p in err.absolute_path) or "<root>"
            lines.append(f"  - at {path}: {err.message}")
        pytest.fail("\n".join(lines))
