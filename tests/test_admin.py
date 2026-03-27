import contextlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.auth import create_jwt


ADMIN_ID = 2206960
NON_ADMIN_ID = 999
TEST_JWT_SECRET = "test-secret-for-admin-tests"


@pytest.fixture
def mock_client():
    client = AsyncMock()
    validate_resp = AsyncMock()
    validate_resp.json.return_value = {"player_id": ADMIN_ID, "name": "Bombla", "faction": {"faction_id": 11559}}
    validate_resp.raise_for_status = lambda: None
    client._http = AsyncMock()
    client._http.get = AsyncMock(return_value=validate_resp)
    client._cache = {"members": (1000000000, []), "war": (1000000000, None)}
    return client


@pytest.fixture
def mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [
        {"player_id": ADMIN_ID, "player_name": "Bombla", "api_key": "admin_key", "is_faction_key": True},
        {"player_id": NON_ADMIN_ID, "player_name": "Member1", "api_key": "member_key", "is_faction_key": False},
    ]
    store.get_keys_metadata.return_value = [
        {"player_id": ADMIN_ID, "player_name": "Bombla", "is_faction_key": True, "created_at": "2026-03-27 12:00:00"},
        {"player_id": NON_ADMIN_ID, "player_name": "Member1", "is_faction_key": False, "created_at": "2026-03-27 13:00:00"},
    ]
    store.delete_key = MagicMock()
    store.get_faction_key.return_value = {"player_id": ADMIN_ID, "player_name": "Bombla", "api_key": "admin_key"}
    return store


@pytest.fixture
def mock_analytics():
    return MagicMock()


def _setup_app(mock_client, mock_store, mock_analytics):
    """Return an ExitStack with all necessary patches applied."""
    stack = contextlib.ExitStack()
    stack.enter_context(patch("app.main.torn_client", mock_client))
    stack.enter_context(patch("app.main.key_store", mock_store))
    stack.enter_context(patch("app.main.analytics_store", mock_analytics))
    stack.enter_context(patch("app.admin._key_store", mock_store))
    stack.enter_context(patch("app.admin._analytics_store", mock_analytics))
    stack.enter_context(patch("app.admin._torn_client", mock_client))
    stack.enter_context(patch("app.admin._app_start_time", 1000000000.0))
    stack.enter_context(patch("app.config.JWT_SECRET", TEST_JWT_SECRET))
    stack.enter_context(patch("app.admin.JWT_SECRET", TEST_JWT_SECRET))
    return stack


@pytest.mark.asyncio
async def test_create_session_success(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/admin/session", headers={"X-Player-Id": str(ADMIN_ID)})
    assert resp.status_code == 200
    assert "token" in resp.json()


@pytest.mark.asyncio
async def test_create_session_non_admin(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/admin/session", headers={"X-Player-Id": str(NON_ADMIN_ID)})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_keys_list(mock_client, mock_store, mock_analytics):
    from app.models import FactionMember, LastAction, MemberStatus
    mock_members = [
        FactionMember(
            id=ADMIN_ID, name="Bombla", level=50, days_in_faction=100,
            last_action=LastAction(status="Online", timestamp=1774600000, relative="1 min ago"),
            status=MemberStatus(description="Okay", details=None, state="Okay", color="green", until=None),
            position="Leader", is_on_wall=False, is_revivable=False, is_in_oc=False,
        ),
        FactionMember(
            id=NON_ADMIN_ID, name="Member1", level=30, days_in_faction=50,
            last_action=LastAction(status="Offline", timestamp=1774500000, relative="5 min ago"),
            status=MemberStatus(description="Okay", details=None, state="Okay", color="green", until=None),
            position="Team 1", is_on_wall=False, is_revivable=False, is_in_oc=False,
        ),
    ]
    mock_client.fetch_members = AsyncMock(return_value=mock_members)

    with _setup_app(mock_client, mock_store, mock_analytics):
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET)
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/api/admin/keys",
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["registered_count"] == 2
    assert data["total_faction_members"] == 2
    assert len(data["keys"]) == 2


@pytest.mark.asyncio
async def test_admin_delete_key(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET)
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(
                f"/api/admin/keys/{NON_ADMIN_ID}",
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["deleted_player_id"] == NON_ADMIN_ID
    assert data["deleted_by"] == ADMIN_ID
    mock_store.delete_key.assert_called_once_with(player_id=NON_ADMIN_ID)


@pytest.mark.asyncio
async def test_admin_cannot_delete_own_key(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET)
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(
                f"/api/admin/keys/{ADMIN_ID}",
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_endpoint_no_token(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/keys")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_request_stats(mock_client, mock_store, mock_analytics):
    mock_analytics.get_request_stats.return_value = {
        "per_day": [{"date": "2026-03-27", "count": 100, "avg_response_ms": 45.0}],
        "per_endpoint": [{"endpoint": "/api/overview", "count": 80, "avg_response_ms": 50.0}],
        "total_requests": 100,
    }
    with _setup_app(mock_client, mock_store, mock_analytics):
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET)
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/stats/requests?days=7", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_requests"] == 100


@pytest.mark.asyncio
async def test_admin_user_stats(mock_client, mock_store, mock_analytics):
    mock_analytics.get_user_stats.return_value = [
        {"player_id": ADMIN_ID, "last_seen": "2026-03-27T15:30:00", "request_count": 50},
    ]
    with _setup_app(mock_client, mock_store, mock_analytics):
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET)
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/stats/users?days=7", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["users"]) == 1
    assert data["users"][0]["player_name"] == "Bombla"


@pytest.mark.asyncio
async def test_admin_error_stats(mock_client, mock_store, mock_analytics):
    mock_analytics.get_error_stats.return_value = [
        {"endpoint": "/api/enemy", "status_code": 502, "count": 3, "last_occurred": "2026-03-27T14:00:00", "last_error_message": "timeout"},
    ]
    with _setup_app(mock_client, mock_store, mock_analytics):
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET)
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/stats/errors?days=7", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["errors"]) == 1
    assert data["errors"][0]["status_code"] == 502


@pytest.mark.asyncio
async def test_admin_system(mock_client, mock_store, mock_analytics):
    mock_analytics.get_integration_status.return_value = {
        "torn_api": {"status": "ok", "last_success": "2026-03-27T15:00:00", "last_error": None, "last_error_at": None},
    }
    with _setup_app(mock_client, mock_store, mock_analytics):
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET)
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/admin/system", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "uptime_seconds" in data
    assert "version" in data
    assert "cache" in data
    assert data["cache"]["entries"] == 2
    assert "integrations" in data
    assert data["integrations"]["torn_api"]["status"] == "ok"
    assert data["integrations"]["tornstats"]["status"] == "unknown"
    assert data["integrations"]["yata"]["status"] == "unknown"
