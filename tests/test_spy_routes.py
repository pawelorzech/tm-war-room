import os
import pytest
from unittest.mock import MagicMock, patch
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
    stats_repo.insert_snapshot(
        player_id=2001, snapshot_date="2026-05-14",
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
            assert data["strength"] == 1e9
            assert data["confidence"] == "exact"
            assert data["source"] == "member_submit"
