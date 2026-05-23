import os
from datetime import date, timedelta
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from tests.helpers import TEST_JWT_SECRET, auth_headers

AUTH_HEADERS = auth_headers()


@pytest.fixture(autouse=True)
def patch_route_jwt_secret():
    with patch("api.main.JWT_SECRET", TEST_JWT_SECRET):
        yield


def _mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [{"player_id": 123, "player_name": "Test", "api_key": "fk", "is_faction_key": False}]
    return store


@pytest.fixture
def setup_db(tmp_path):
    from api.db.migrations.runner import run_migrations
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return db_path


@pytest.mark.asyncio
async def test_get_spy_not_found(setup_db):
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)
    with patch("api.main.key_store", _mock_store()), patch("api.routers.spy.spy_service", spy_svc):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/99999", headers=AUTH_HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_known_endpoint_enriches_missing_names_from_attack_log(setup_db):
    # Reproduces production state: a TornStats estimate exists with no name, but
    # we've previously logged an attack against the player so we have a name locally.
    # /api/spy/known must surface that name instead of leaving the row as "Unknown player".
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)
    spy_repo.update_estimate(player_id=777, player_name=None, source="tornstats",
        strength=1e9, defense=1e9, speed=1e9, dexterity=1e9, total=4e9,
        confidence="estimate", reported_at="2026-05-15T12:00:00")
    conn = spy_repo._conn()
    conn.execute(
        """INSERT INTO attack_log
           (id, attacker_id, attacker_name, defender_id, defender_name, result, started, ended)
           VALUES (1, 999, 'Me', 777, 'EnemyName', 'Attacked', 1700000000, 1700000060)""",
    )
    conn.commit()
    with patch("api.main.key_store", _mock_store()), patch("api.routers.spy.spy_service", spy_svc):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/known", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    estimates = resp.json()["estimates"]
    row = next(e for e in estimates if e["player_id"] == 777)
    assert row["player_name"] == "EnemyName"


@pytest.mark.asyncio
async def test_faction_snapshot_fallback_when_no_spy(setup_db):
    """Faction members never get spied (you don't spy your own teammates), so
    TornStats and YATA almost always return nothing for them. Before this
    fallback, the companion showed "no spy estimate available" for the entire
    faction. We pull the player's own stat_snapshots row (their API key →
    exact battle stats) and return it as a SpyEstimate-shaped response.
    """
    from api.db.repos.spies import SpyRepository
    from api.db.repos.stats import StatSnapshotRepository
    from api.services.spy import SpyService

    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)
    stats_repo = StatSnapshotRepository(setup_db)
    # Kaszmir registered an API key; daily snapshot collector wrote his stats.
    # Use a 1-day-old snapshot so the "exact" confidence threshold (<= 7 days)
    # stays valid as the test ages — hardcoding a literal date silently flips
    # the confidence to "estimate" once the date passes that window.
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    stats_repo.insert_snapshot(
        player_id=2001, snapshot_date=yesterday,
        strength=20_000_000, defense=20_000_000, speed=20_000_000, dexterity=18_780_000,
        total=78_780_000, level=70,
    )

    with patch("api.main.key_store", _mock_store()), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.stats_repo", stats_repo), \
         patch("api.routers.spy.torn_client", None):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/2001", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    data = resp.json()
    assert data["player_id"] == 2001
    assert data["total"] == 78_780_000
    assert data["source"] == "faction_snapshot"
    assert data["confidence"] == "exact"  # snapshot is 1 day old


@pytest.mark.asyncio
async def test_partial_tornstats_response_skipped(setup_db):
    """Regression for player 575480 (2026-05-16): TornStats returned a partial
    spy — 2 of 4 per-stat were real numbers, 2 were "N/A" (coerced to 0).
    A loose sum-of-stats > 0 guard would accept the row; a strict per-field
    guard rejects it. Storing partial data next to a real total still misleads
    ("strength = 0?"), so we treat any missing per-stat as estimate-only."""
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService

    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)

    mock_torn = MagicMock()
    mock_torn.fetch_tornstats_spy_user = AsyncMock(return_value={
        "player_id": 575480, "player_name": "PartialSpy",
        "strength": 0.0, "defense": 1_202_543_783.0,
        "speed": 0.0, "dexterity": 1_371_881_551.0,
        "total": 7_058_029_689.0, "timestamp": None,
    })
    mock_torn.fetch_yata_spy_user = AsyncMock(return_value=None)
    failing_resp = MagicMock()
    failing_resp.status_code = 404
    mock_torn._http.get = AsyncMock(return_value=failing_resp)

    with patch("api.main.key_store", _mock_store()), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.torn_client", mock_torn), \
         patch("api.routers.spy.tornstats_key", "fake_key"), \
         patch("api.routers.spy.stats_repo", None):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/575480", headers=AUTH_HEADERS)

    assert spy_repo.get_reports(575480) == []
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_estimate_only_tornstats_response_skipped(setup_db):
    """Regression for player 348794 (2026-05-16): TornStats returned a
    "estimate-only" response — per-stat fields were coerced to 0 by the parser
    but total was a real number. Before this fix the endpoint upserted the row,
    and refresh_estimate happily picked it as the freshest report, surfacing
    a wildly wrong total next to four NaN cells in the UI.

    Now we treat sum-of-per-stats == 0 as the unmistakable estimate-only
    signal and skip the upsert; the endpoint falls through to the fallback
    (or 404 if nothing else applies)."""
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService

    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)

    mock_torn = MagicMock()
    mock_torn.fetch_tornstats_spy_user = AsyncMock(return_value={
        "player_id": 348794, "player_name": "DeadlyAssassin",
        "strength": 0.0, "defense": 0.0, "speed": 0.0, "dexterity": 0.0,
        "total": 2669168643.0, "timestamp": None,
    })
    mock_torn.fetch_yata_spy_user = AsyncMock(return_value=None)
    # Heuristic estimator path: make personalstats fetch return 404 so it
    # bails, leaving the endpoint with no data to return.
    failing_resp = MagicMock()
    failing_resp.status_code = 404
    mock_torn._http.get = AsyncMock(return_value=failing_resp)

    with patch("api.main.key_store", _mock_store()), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.torn_client", mock_torn), \
         patch("api.routers.spy.tornstats_key", "fake_key"), \
         patch("api.routers.spy.stats_repo", None):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/348794", headers=AUTH_HEADERS)

    # No report rows must have been written for this player — the estimate-only
    # response was rejected at the upsert guard.
    reports = spy_repo.get_reports(348794)
    assert reports == [], f"estimate-only response must not be persisted, got {reports}"
    # And the endpoint must not silently return a row with sum-of-stats == 0
    # alongside a 2.67B total. With no other source available, 404 is correct.
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_submit_and_get_spy(setup_db):
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)
    with patch("api.main.key_store", _mock_store()), patch("api.routers.spy.spy_service", spy_svc):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/spy/submit", json={
                "player_id": 456, "strength": 1e9, "defense": 8e8, "speed": 5e8, "dexterity": 6e8,
            }, headers=AUTH_HEADERS)
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"
            resp = await ac.get("/api/spy/456", headers=AUTH_HEADERS)
            assert resp.status_code == 200
            data = resp.json()
            assert data["player_id"] == 456
            # member_submit is a real-spy source (a teammate typed in known
            # stats — highest SOURCE_PRIORITY). bucket_and_range classifies
            # it as 'verified' when fresh, so per-stat round-trip exactly
            # and the UI grid renders.
            assert data["strength"] == 1e9
            assert data["defense"] == 8e8
            assert data["speed"] == 5e8
            assert data["dexterity"] == 6e8
            assert data["total"] == 1e9 + 8e8 + 5e8 + 6e8
            assert data["confidence"] == "exact"
            assert data["source"] == "member_submit"
            assert data["bucket"] == "verified"


# ---------------------------------------------------------------------------
# Per-user TornStats key pool (migration 053).
# ---------------------------------------------------------------------------

def _real_spy(player_id: int = 117941, total: int = 13_000_000_000) -> dict:
    per = total // 4
    return {
        "player_id": player_id, "player_name": "Andr3w",
        "strength": per, "defense": per, "speed": per, "dexterity": per,
        "total": total, "timestamp": None,
    }


@pytest.mark.asyncio
async def test_tornstats_pool_prefers_caller_key(setup_db):
    """Caller's own TornStats key is tried first; pool keys aren't touched if it hits."""
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)

    fetch = AsyncMock(return_value=_real_spy())
    mock_torn = MagicMock(fetch_tornstats_spy_user=fetch, fetch_yata_spy_user=AsyncMock(return_value=None))

    store = MagicMock()
    store.get_tornstats_key.return_value = "caller_key_xxxxx"
    # Pool returns a different member's key — must not be called because caller already worked.
    store.get_all_valid_tornstats_keys.return_value = [(999, "pool_key_xxxxx")]

    with patch("api.main.key_store", store), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.torn_client", mock_torn), \
         patch("api.routers.spy.tornstats_key", "global_key_xxxxx"), \
         patch("api.routers.spy.key_store", store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/117941", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    assert resp.json()["total"] == 13_000_000_000
    # Caller key tried first; succeeded; no other key in the candidate list got a call.
    keys_used = [c.args[1] for c in fetch.call_args_list]
    assert keys_used[0] == "caller_key_xxxxx"
    assert len(keys_used) == 1, f"expected single call, got {keys_used}"


@pytest.mark.asyncio
async def test_tornstats_pool_marks_403_key_invalid_and_falls_through(setup_db):
    """Caller's key returns 403 → marked invalid → next key in pool is tried."""
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    from api.torn_client import TornStatsAuthError
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)

    async def fetch_side_effect(_pid, key):
        if key == "bad_caller_key":
            raise TornStatsAuthError("HTTP 403")
        return _real_spy()
    mock_torn = MagicMock(fetch_tornstats_spy_user=AsyncMock(side_effect=fetch_side_effect),
                          fetch_yata_spy_user=AsyncMock(return_value=None))

    store = MagicMock()
    store.get_tornstats_key.return_value = "bad_caller_key"
    store.get_all_valid_tornstats_keys.return_value = [(999, "good_pool_key")]

    with patch("api.main.key_store", store), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.torn_client", mock_torn), \
         patch("api.routers.spy.tornstats_key", ""), \
         patch("api.routers.spy.key_store", store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/117941", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    # Caller's key got marked invalid for player_id=123 (from auth_headers default).
    store.mark_tornstats_key_status.assert_called_once_with(123, "invalid")


@pytest.mark.asyncio
async def test_tornstats_pool_falls_back_to_global_key(setup_db):
    """No per-user keys configured → uses global TORNSTATS_API_KEY (existing behavior)."""
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)

    fetch = AsyncMock(return_value=_real_spy())
    mock_torn = MagicMock(fetch_tornstats_spy_user=fetch, fetch_yata_spy_user=AsyncMock(return_value=None))

    store = MagicMock()
    store.get_tornstats_key.return_value = None
    store.get_all_valid_tornstats_keys.return_value = []

    with patch("api.main.key_store", store), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.torn_client", mock_torn), \
         patch("api.routers.spy.tornstats_key", "global_env_key"), \
         patch("api.routers.spy.key_store", store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/117941", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    keys_used = [c.args[1] for c in fetch.call_args_list]
    assert keys_used == ["global_env_key"]


# ---------------------------------------------------------------------------
# bucket_and_range integration into /api/spy/{id} (Task 2).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_spy_endpoint_attaches_bucket_and_range(setup_db):
    """The single-player spy endpoint returns the new display fields:
    bucket / total_range / range_width_pct / heuristic_confidence."""
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    from datetime import datetime, timezone
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)
    # Seed a recent TornStats spy so the bucket lands in 'verified' or 'estimate'
    now_iso = datetime.now(timezone.utc).isoformat()
    spy_repo.upsert_report(
        player_id=12345, player_name="TestVictim",
        source="tornstats",
        strength=1_000_000_000, defense=1_000_000_000,
        speed=1_000_000_000, dexterity=1_000_000_000,
        total=4_000_000_000,
        confidence="estimate",
        reported_at=now_iso,
    )
    spy_svc.refresh_estimate(12345)
    with patch("api.main.key_store", _mock_store()), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.torn_client", None):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/12345", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "bucket" in body
    assert body["bucket"] in {"verified", "estimate", "rough_guess"}
    assert "total_range" in body
    assert isinstance(body["total_range"], list) and len(body["total_range"]) == 2
    assert isinstance(body["range_width_pct"], int)
    assert "heuristic_confidence" in body


@pytest.mark.asyncio
async def test_spy_endpoint_nulls_per_stat_for_rough_guess(setup_db):
    """When data is heuristic-only, per-stat fields are nulled so the UI
    hides the misleading equal-split grid."""
    from api.db.repos.spies import SpyRepository
    from api.services.spy import SpyService
    from datetime import datetime, timezone
    spy_repo = SpyRepository(setup_db)
    spy_svc = SpyService(spy_repo)
    # Seed an estimated (heuristic) source row
    now_iso = datetime.now(timezone.utc).isoformat()
    spy_repo.upsert_report(
        player_id=23456, player_name="HeuristicOnly",
        source="estimated",
        strength=1_250_000_000, defense=1_250_000_000,
        speed=1_250_000_000, dexterity=1_250_000_000,
        total=5_000_000_000,
        confidence="estimate",
        reported_at=now_iso,
    )
    spy_svc.refresh_estimate(23456)
    with patch("api.main.key_store", _mock_store()), \
         patch("api.routers.spy.spy_service", spy_svc), \
         patch("api.routers.spy.torn_client", None):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/spy/23456", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["bucket"] == "rough_guess"
    assert body["strength"] is None
    assert body["defense"] is None
    assert body["speed"] is None
    assert body["dexterity"] is None
    # SQLite REAL → JSON float; we only care the total survived round-trip
    assert isinstance(body["total"], (int, float)) and body["total"] > 0
