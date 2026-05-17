"""POST/GET/DELETE /api/preferences/tornstats-key — per-user TornStats key registration."""
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from cryptography.fernet import Fernet
from tests.helpers import TEST_JWT_SECRET, auth_headers

AUTH = auth_headers()


@pytest.fixture(autouse=True)
def patch_route_jwt_secret():
    with patch("api.main.JWT_SECRET", TEST_JWT_SECRET):
        yield


@pytest.fixture
def real_key_store(tmp_path):
    """A real KeyStore (real Fernet + sqlite) seeded with the caller's API key."""
    from api.db import KeyStore
    db_path = str(tmp_path / "test.db")
    enc_key = Fernet.generate_key().decode()
    store = KeyStore(db_path=db_path, encryption_key=enc_key)
    # Caller (X-Player-Id=123 from default AUTH headers) must have a Torn API key
    # registered for the /api/preferences/* `_verify_member` gate.
    store.save_key(player_id=123, player_name="Test", api_key="torn_fake_xxxxxx")
    return store


@pytest.mark.asyncio
async def test_post_tornstats_key_validates_and_stores(real_key_store):
    """Valid key passes TornStats probe → encrypted + stored + status='ok'."""
    mock_torn = MagicMock()
    mock_torn.fetch_tornstats_spy_user = AsyncMock(return_value=None)  # status:false is fine — auth worked

    with patch("api.routers.preferences.key_store", real_key_store), \
         patch("api.routers.preferences.torn_client", mock_torn), \
         patch("api.main.key_store", real_key_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/preferences/tornstats-key",
                json={"key": "dHOrM1XmzjPP6CFO"},
                headers=AUTH,
            )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["has_key"] is True
    assert body["status"] == "ok"
    # And the key round-trips through Fernet decryption back to the original plaintext.
    assert real_key_store.get_tornstats_key(123) == "dHOrM1XmzjPP6CFO"


@pytest.mark.asyncio
async def test_post_tornstats_key_rejects_403(real_key_store):
    """TornStats returns 401/403 → 400 to client, key NOT stored."""
    from api.torn_client import TornStatsAuthError
    mock_torn = MagicMock()
    mock_torn.fetch_tornstats_spy_user = AsyncMock(side_effect=TornStatsAuthError("HTTP 403"))

    with patch("api.routers.preferences.key_store", real_key_store), \
         patch("api.routers.preferences.torn_client", mock_torn), \
         patch("api.main.key_store", real_key_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/preferences/tornstats-key",
                json={"key": "BadKey1234567890"},
                headers=AUTH,
            )

    assert resp.status_code == 400
    assert real_key_store.get_tornstats_key(123) is None


@pytest.mark.asyncio
async def test_get_tornstats_key_meta_never_leaks_plaintext(real_key_store):
    """GET returns status+timestamp, never the raw key (it's a secret)."""
    real_key_store.set_tornstats_key(123, "SecretKey_DoNotLeak")

    mock_torn = MagicMock()

    with patch("api.routers.preferences.key_store", real_key_store), \
         patch("api.routers.preferences.torn_client", mock_torn), \
         patch("api.main.key_store", real_key_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/preferences/tornstats-key", headers=AUTH)

    body = resp.json()
    assert body["has_key"] is True
    assert "SecretKey_DoNotLeak" not in resp.text
    assert "key" not in body  # explicitly no plaintext field


@pytest.mark.asyncio
async def test_delete_tornstats_key_clears(real_key_store):
    real_key_store.set_tornstats_key(123, "AnyKey1234567890")
    assert real_key_store.get_tornstats_key(123) is not None

    mock_torn = MagicMock()
    with patch("api.routers.preferences.key_store", real_key_store), \
         patch("api.routers.preferences.torn_client", mock_torn), \
         patch("api.main.key_store", real_key_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete("/api/preferences/tornstats-key", headers=AUTH)

    assert resp.status_code == 200
    assert real_key_store.get_tornstats_key(123) is None


@pytest.mark.asyncio
async def test_invalid_status_hides_key_from_pool(real_key_store):
    """Pool getter skips keys marked invalid — prevents re-use of known-bad keys."""
    real_key_store.set_tornstats_key(123, "GoodKey1234567890")
    assert ("GoodKey1234567890" in [k for _, k in real_key_store.get_all_valid_tornstats_keys()])

    real_key_store.mark_tornstats_key_status(123, "invalid")
    assert real_key_store.get_all_valid_tornstats_keys() == []
    assert real_key_store.get_tornstats_key(123) is None
