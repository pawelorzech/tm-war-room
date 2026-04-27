import contextlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from api.auth import create_jwt
from tests.helpers import TEST_JWT_SECRET, auth_headers


ADMIN_ID = 2362436
NON_ADMIN_ID = 999


@pytest.fixture
def mock_client():
    client = AsyncMock()
    validate_resp = AsyncMock()
    validate_resp.json.return_value = {"player_id": ADMIN_ID, "name": "Bombla", "faction": {"faction_id": 11559}}
    validate_resp.raise_for_status = lambda: None
    client._http = AsyncMock()
    client._http.get = AsyncMock(return_value=validate_resp)
    client._cache = {"members": (1000000000, []), "war": (1000000000, None)}
    client.fetch_members = AsyncMock(return_value=[])
    client.fetch_war = AsyncMock(return_value=None)
    client.fetch_chain = AsyncMock(return_value={})
    return client


@pytest.fixture
def mock_store():
    store = MagicMock()
    registered_keys = {
        ADMIN_ID: {"player_id": ADMIN_ID, "player_name": "Bombla", "api_key": "admin_key", "is_faction_key": True},
        NON_ADMIN_ID: {"player_id": NON_ADMIN_ID, "player_name": "Member1", "api_key": "member_key", "is_faction_key": False},
    }
    store.get_all_keys.return_value = list(registered_keys.values())
    store.get_key.side_effect = lambda player_id: registered_keys.get(player_id)
    store.has_key.side_effect = lambda player_id: player_id in registered_keys
    store.get_keys_metadata.return_value = [
        {"player_id": ADMIN_ID, "player_name": "Bombla", "is_faction_key": True, "created_at": "2026-03-27 12:00:00"},
        {"player_id": NON_ADMIN_ID, "player_name": "Member1", "is_faction_key": False, "created_at": "2026-03-27 13:00:00"},
    ]
    store.delete_key = MagicMock()
    store.get_faction_key.return_value = {"player_id": ADMIN_ID, "player_name": "Bombla", "api_key": "admin_key"}
    store.is_admin = MagicMock(side_effect=lambda pid: pid == ADMIN_ID)
    store.get_admins = MagicMock(return_value=[])
    store.promote_admin = MagicMock()
    store.demote_admin = MagicMock()
    return store


@pytest.fixture
def mock_analytics():
    return MagicMock()


def _setup_app(mock_client, mock_store, mock_analytics):
    """Return an ExitStack with all necessary patches applied."""
    stack = contextlib.ExitStack()
    stack.enter_context(patch("api.main.torn_client", mock_client))
    stack.enter_context(patch("api.main.key_store", mock_store))
    stack.enter_context(patch("api.main.analytics_store", mock_analytics))
    stack.enter_context(patch("api.main.JWT_SECRET", TEST_JWT_SECRET))
    stack.enter_context(patch("api.admin._key_store", mock_store))
    stack.enter_context(patch("api.admin._analytics_store", mock_analytics))
    stack.enter_context(patch("api.admin._torn_client", mock_client))
    stack.enter_context(patch("api.admin._app_start_time", 1000000000.0))
    stack.enter_context(patch("api.config.JWT_SECRET", TEST_JWT_SECRET))
    stack.enter_context(patch("api.admin.JWT_SECRET", TEST_JWT_SECRET))
    stack.enter_context(patch("api.admin.SUPERADMIN_ID", ADMIN_ID))
    stack.enter_context(patch("api.admin.SUPERADMIN_IDS", frozenset([ADMIN_ID])))
    return stack


@pytest.mark.asyncio
async def test_create_session_success(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        session_token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="session")
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/admin/session",
                headers={"Authorization": f"Bearer {session_token}"},
            )
    assert resp.status_code == 200
    assert "token" in resp.json()


@pytest.mark.asyncio
async def test_create_session_non_admin(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        session_token = create_jwt(NON_ADMIN_ID, "Member1", TEST_JWT_SECRET, token_type="session")
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/admin/session",
                headers={"Authorization": f"Bearer {session_token}"},
            )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_session_requires_authorization(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/admin/session")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_keys_list(mock_client, mock_store, mock_analytics):
    from api.models import FactionMember, LastAction, MemberStatus

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
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
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
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
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
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
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
        from api.main import app
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
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
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
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
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
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
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
        token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
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


@pytest.mark.asyncio
async def test_delete_key_endpoint_requires_admin_token(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        session_token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="session")
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(
                f"/api/keys/{NON_ADMIN_ID}",
                headers={"Authorization": f"Bearer {session_token}", "X-Player-Id": str(ADMIN_ID)},
            )
    assert resp.status_code == 401
    mock_store.delete_key.assert_not_called()


@pytest.mark.asyncio
async def test_delete_key_endpoint_rejects_non_admin_admin_token(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        forged_admin_token = create_jwt(NON_ADMIN_ID, "Member1", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(
                f"/api/keys/{ADMIN_ID}",
                headers={"Authorization": f"Bearer {forged_admin_token}", "X-Player-Id": str(NON_ADMIN_ID)},
            )
    assert resp.status_code == 403
    mock_store.delete_key.assert_not_called()


@pytest.mark.asyncio
async def test_delete_key_endpoint_allows_admin_token(mock_client, mock_store, mock_analytics):
    with _setup_app(mock_client, mock_store, mock_analytics):
        admin_token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="admin")
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(
                f"/api/keys/{NON_ADMIN_ID}",
                headers={"Authorization": f"Bearer {admin_token}", "X-Player-Id": str(ADMIN_ID)},
            )
    assert resp.status_code == 200
    assert resp.json()["deleted_player_id"] == NON_ADMIN_ID
    mock_store.delete_key.assert_called_once_with(player_id=NON_ADMIN_ID)


@pytest.mark.asyncio
async def test_middleware_logs_requests(mock_client, mock_store):
    """Verify the analytics middleware logs requests when analytics_store is set."""
    from api.analytics import AnalyticsStore
    import os
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        real_analytics = AnalyticsStore(db_path=os.path.join(tmp, "test.db"))
        with patch("api.main.torn_client", mock_client), \
             patch("api.main.key_store", mock_store), \
             patch("api.main.analytics_store", real_analytics), \
             patch("api.main.JWT_SECRET", TEST_JWT_SECRET):
            from api.main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                await ac.get("/api/overview", headers=auth_headers(ADMIN_ID, "Bombla"))
        stats = real_analytics.get_request_stats(days=1)
        assert stats["total_requests"] >= 1
        users = real_analytics.get_user_stats(days=1)
        pids = {u["player_id"] for u in users}
        assert ADMIN_ID in pids


@pytest.mark.asyncio
async def test_create_session_rejects_revoked_torn_key(mock_client, mock_store, mock_analytics):
    """F-06 regression: if Torn API rejects the stored key, admin escalation fails."""
    revoked_resp = AsyncMock()
    revoked_resp.json.return_value = {"error": {"code": 2, "error": "Incorrect key"}}
    revoked_resp.raise_for_status = lambda: None
    mock_client._http = AsyncMock()
    mock_client._http.get = AsyncMock(return_value=revoked_resp)

    with _setup_app(mock_client, mock_store, mock_analytics):
        session_token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="session")
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/admin/session",
                headers={"Authorization": f"Bearer {session_token}"},
            )
    assert resp.status_code == 401
    assert "Re-validate" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_session_rejects_key_with_wrong_player_id(mock_client, mock_store, mock_analytics):
    """F-06 regression: if Torn returns a different player_id than expected, escalation fails."""
    wrong_pid_resp = AsyncMock()
    wrong_pid_resp.json.return_value = {"player_id": 99999, "name": "WrongUser", "faction": {"faction_id": 11559}}
    wrong_pid_resp.raise_for_status = lambda: None
    mock_client._http = AsyncMock()
    mock_client._http.get = AsyncMock(return_value=wrong_pid_resp)

    with _setup_app(mock_client, mock_store, mock_analytics):
        session_token = create_jwt(ADMIN_ID, "Bombla", TEST_JWT_SECRET, token_type="session")
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/admin/session",
                headers={"Authorization": f"Bearer {session_token}"},
            )
    assert resp.status_code == 401
