import sqlite3
import pytest
from api.db.repos.version_dismissals import VersionDismissalRepository

from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from api.routers.version import router as version_router
import api.routers.version as version_mod


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS version_dismissals (
            player_id INTEGER NOT NULL,
            version TEXT NOT NULL,
            dismissed_at TEXT NOT NULL,
            UNIQUE(player_id, version)
        )
    """)
    conn.commit()
    conn.close()
    return VersionDismissalRepository(db_path)


def test_not_dismissed_by_default(repo):
    assert repo.is_dismissed(player_id=123, version="1.1.0") is False


def test_dismiss_and_check(repo):
    repo.dismiss(player_id=123, version="1.1.0")
    assert repo.is_dismissed(player_id=123, version="1.1.0") is True


def test_dismiss_idempotent(repo):
    repo.dismiss(player_id=123, version="1.1.0")
    repo.dismiss(player_id=123, version="1.1.0")
    assert repo.is_dismissed(player_id=123, version="1.1.0") is True


def test_dismiss_scoped_to_player(repo):
    repo.dismiss(player_id=123, version="1.1.0")
    assert repo.is_dismissed(player_id=456, version="1.1.0") is False


def test_dismiss_scoped_to_version(repo):
    repo.dismiss(player_id=123, version="1.0.0")
    assert repo.is_dismissed(player_id=123, version="1.1.0") is False


@pytest.fixture
def version_app(repo):
    version_mod.dismissal_repo = repo
    app = FastAPI()
    app.include_router(version_router)
    return app


@pytest.mark.asyncio
async def test_version_status_not_dismissed(version_app):
    async with AsyncClient(transport=ASGITransport(app=version_app), base_url="http://test") as ac:
        resp = await ac.get("/api/version/status", params={"v": "1.1.0"}, headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    assert resp.json() == {"dismissed": False}


@pytest.mark.asyncio
async def test_version_dismiss_and_check(version_app):
    async with AsyncClient(transport=ASGITransport(app=version_app), base_url="http://test") as ac:
        resp = await ac.post("/api/version/dismiss", json={"version": "1.1.0"}, headers={"X-Player-Id": "123"})
        assert resp.status_code == 200
        resp2 = await ac.get("/api/version/status", params={"v": "1.1.0"}, headers={"X-Player-Id": "123"})
    assert resp2.json() == {"dismissed": True}
