import os
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport

AUTH_HEADERS = {"X-Player-Id": "123"}


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
