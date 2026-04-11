import pytest
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from httpx import AsyncClient, ASGITransport

from api.auth import create_jwt
from api.models import FactionMember, WarStatus, MemberBars, Bar, Cooldowns, LastAction, MemberStatus, WarFaction, FactionInfo, PersonalStats
from tests.helpers import TEST_JWT_SECRET, auth_headers

AUTH_HEADERS = auth_headers()


@pytest.fixture(autouse=True)
def patch_route_jwt_secret():
    with patch("api.main.JWT_SECRET", TEST_JWT_SECRET), patch("api.routers.chat.JWT_SECRET", TEST_JWT_SECRET):
        yield


def _make_member(id: int = 123, name: str = "Test", status_state: str = "Okay", online: str = "Online", position: str = "Team 1") -> FactionMember:
    return FactionMember(
        id=id, name=name, level=50, days_in_faction=100,
        last_action=LastAction(status=online, timestamp=1774600000, relative="1 min ago"),
        status=MemberStatus(description=status_state, details=None, state=status_state, color="green", until=None),
        position=position, is_on_wall=False, is_revivable=False, is_in_oc=False,
    )


def _make_war() -> WarStatus:
    return WarStatus(
        war_id=100, start=1774630800, end=None, target=500, winner=None,
        factions=[WarFaction(id=1, name="Enemy", score=5, chain=10), WarFaction(id=2, name="Us", score=8, chain=15)],
    )


@pytest.fixture
def mock_client():
    client = AsyncMock()
    client.fetch_members = AsyncMock(return_value=[_make_member()])
    client.fetch_war = AsyncMock(return_value=_make_war())
    client.fetch_member_bars = AsyncMock(return_value=MemberBars(
        energy=Bar(current=500, maximum=150),
        happy=Bar(current=4000, maximum=4525),
        cooldowns=Cooldowns(drug=3600),
    ))
    client.fetch_chain = AsyncMock(return_value={"id": 0, "current": 0, "max": 10, "timeout": 0, "modifier": 1, "cooldown": 0, "start": 0, "end": 0})
    client.fetch_yata_members = AsyncMock(return_value=None)
    return client


@pytest.fixture
def mock_store():
    store = MagicMock()
    registered_keys = {
        123: {"player_id": 123, "player_name": "Test", "api_key": "fake_key", "is_faction_key": False},
        999: {"player_id": 999, "player_name": "EnemyBaseline", "api_key": "baseline_key", "is_faction_key": False},
    }
    store.get_all_keys.return_value = list(registered_keys.values())
    store.get_key.side_effect = lambda player_id: registered_keys.get(player_id)
    store.get_faction_key.return_value = None
    store.has_key.side_effect = lambda player_id: player_id in registered_keys
    store.save_key = MagicMock()
    store.delete_key = MagicMock()
    store.is_admin = MagicMock(return_value=False)
    return store


class StubChatManager:
    def __init__(self):
        self.connected: list[int] = []
        self.disconnected: list[int] = []

    async def connect(self, player_id: int, ws) -> None:
        self.connected.append(player_id)
        await ws.accept()

    def disconnect(self, player_id: int) -> None:
        self.disconnected.append(player_id)


@pytest.mark.asyncio
async def test_overview(mock_client, mock_store):
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/overview", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["members"]) == 1
    assert data["members"][0]["name"] == "Test"
    assert data["war"]["war_id"] == 100


@pytest.mark.asyncio
async def test_serve_frontend_blocks_path_traversal():
    import os

    with tempfile.TemporaryDirectory() as static_root, tempfile.TemporaryDirectory() as outside_root:
        with open(os.path.join(static_root, "index.html"), "w", encoding="utf-8") as fh:
            fh.write("index")
        secret_path = os.path.join(outside_root, "secret.txt")
        with open(secret_path, "w", encoding="utf-8") as fh:
            fh.write("secret")
        traversal = os.path.relpath(secret_path, static_root)

        with patch("api.main.static_dir", static_root):
            from api.main import serve_frontend

            with pytest.raises(HTTPException) as excinfo:
                await serve_frontend(traversal)

    assert excinfo.value.status_code == 404


@pytest.mark.asyncio
async def test_overview_no_auth(mock_client, mock_store):
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/overview")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_overview_rejects_token_player_mismatch(mock_client, mock_store):
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/overview", headers=auth_headers(999, "Mismatch") | {"X-Player-Id": "123"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_members_detail(mock_client, mock_store):
    import api.main as _main
    _main._bars_cache = {123: {"energy": 500, "max_energy": 1000, "drug_cd": 0}}
    try:
        with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
            from api.main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                resp = await ac.get("/api/members/detail", headers=AUTH_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["yata_down"] is True
        assert "123" in data["members"]
        assert data["members"]["123"]["source"] == "torn_api"
        assert data["members"]["123"]["energy"] == 500
    finally:
        _main._bars_cache = {}


@pytest.mark.asyncio
async def test_register_key(mock_client, mock_store):
    validate_resp = AsyncMock()
    validate_resp.json.return_value = {"player_id": 999, "name": "NewPlayer", "faction": {"faction_id": 11559}}
    validate_resp.raise_for_status = lambda: None
    mock_client._http = AsyncMock()
    mock_client._http.get = AsyncMock(return_value=validate_resp)

    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/keys", json={"api_key": "some_key"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_register_key_wrong_faction(mock_client, mock_store):
    validate_resp = AsyncMock()
    validate_resp.json.return_value = {"player_id": 999, "name": "Enemy", "faction": {"faction_id": 9999}}
    validate_resp.raise_for_status = lambda: None
    mock_client._http = AsyncMock()
    mock_client._http.get = AsyncMock(return_value=validate_resp)

    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/keys", json={"api_key": "enemy_key"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_key_requires_admin_token(mock_client, mock_store):
    session_token = create_jwt(123, "Test", TEST_JWT_SECRET, token_type="session")

    with patch("api.main.torn_client", mock_client), \
         patch("api.main.key_store", mock_store), \
         patch("api.admin._key_store", mock_store), \
         patch("api.admin.JWT_SECRET", TEST_JWT_SECRET), \
         patch("api.admin.SUPERADMIN_ID", 999999):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(
                "/api/keys/999",
                headers={"Authorization": f"Bearer {session_token}", "X-Player-Id": "123"},
            )

    assert resp.status_code == 401
    mock_store.delete_key.assert_not_called()


@pytest.mark.asyncio
async def test_delete_key_with_admin_token_succeeds(mock_client, mock_store):
    admin_token = create_jwt(123, "Test", TEST_JWT_SECRET, token_type="admin")

    with patch("api.main.torn_client", mock_client), \
         patch("api.main.key_store", mock_store), \
         patch("api.admin._key_store", mock_store), \
         patch("api.admin.JWT_SECRET", TEST_JWT_SECRET), \
         patch("api.admin.SUPERADMIN_ID", 123):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete(
                "/api/keys/999",
                headers={"Authorization": f"Bearer {admin_token}", "X-Player-Id": "123"},
            )

    assert resp.status_code == 200
    assert resp.json() == {
        "status": "ok",
        "deleted_player_id": 999,
        "deleted_by": 123,
    }
    mock_store.delete_key.assert_called_once_with(player_id=999)


@pytest.mark.asyncio
async def test_enemy_with_rw(mock_client, mock_store):
    mock_client.fetch_war = AsyncMock(return_value=_make_war())
    mock_client.fetch_enemy_members = AsyncMock(return_value=[_make_member(id=999, name="Enemy1")])
    mock_client.fetch_faction_info = AsyncMock(return_value=FactionInfo(
        id=9420, name="The Pusheen Army", tag="TPA", respect=4000000,
        members_count=73, rank_name="Platinum", rank_level=16, best_chain=50000, wins=62))
    mock_client.fetch_tornstats_spy = AsyncMock(return_value={
        999: PersonalStats(xanax_taken=2000, refills=900, attacks_won=4000,
                           networth=5_000_000_000, highest_beaten=100, best_damage=6000,
                           best_kill_streak=90, damage_done=13_000_000)})
    mock_client.fetch_personalstats = AsyncMock(return_value=PersonalStats(
        xanax_taken=3000, refills=1500, attacks_won=8000, defends_won=500,
        networth=11_000_000_000, highest_beaten=100, best_damage=7000,
        best_kill_streak=100, damage_done=20_000_000))
    registered_keys = {
        123: {"player_id": 123, "player_name": "bombel", "api_key": "fk", "is_faction_key": False},
        999: {"player_id": 999, "player_name": "EnemyBaseline", "api_key": "baseline_key", "is_faction_key": False},
    }
    mock_store.get_all_keys = MagicMock(return_value=list(registered_keys.values()))
    mock_store.get_key.side_effect = lambda player_id: registered_keys.get(player_id)
    mock_store.has_key.side_effect = lambda player_id: player_id in registered_keys

    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store), \
         patch("api.main.TORNSTATS_API_KEY", "fake_ts_key"):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/enemy?baseline_pid=123", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["faction"]["name"] == "The Pusheen Army"
    assert len(data["members"]) == 1
    assert data["members"][0]["threat_score"] > 0
    assert "attack_url" in data["members"][0]
    assert data["threat_mode"] == "relative"
    assert data["threat_baseline"] == "bombel"


FAKE_YATA = {
    "123": {
        "id": 123, "name": "Test", "energy_share": 1, "energy": 87,
        "drug_cd": 14400, "refill": False, "nnb_share": 0, "nnb": 0,
        "stats_share": -1, "stats_dexterity": 0, "stats_defense": 0,
        "stats_speed": 0, "stats_strength": 0, "stats_total": 0,
        "status": "online", "last_action": 1711500000, "dif": 365,
        "crimes_rank": 5, "bonus_score": 120, "carnage": 2, "revive": True,
    },
    "456": {
        "id": 456, "name": "Other", "energy_share": 1, "energy": 120,
        "drug_cd": 0, "refill": True, "nnb_share": 0, "nnb": 0,
        "stats_share": -1, "stats_dexterity": 0, "stats_defense": 0,
        "stats_speed": 0, "stats_strength": 0, "stats_total": 0,
        "status": "online", "last_action": 1711500000, "dif": 200,
        "crimes_rank": 3, "bonus_score": 80, "carnage": 1, "revive": True,
    },
}


@pytest.fixture
def mock_client_yata():
    client = AsyncMock()
    client.fetch_members = AsyncMock(return_value=[
        _make_member(id=123, name="Leader", position="Leader"),
        _make_member(id=456, name="Member1", position="Team 1"),
    ])
    client.fetch_yata_members = AsyncMock(return_value=FAKE_YATA)
    client.fetch_member_bars = AsyncMock(return_value=MemberBars(
        energy=Bar(current=150, maximum=150),
        happy=Bar(current=4000, maximum=4525),
        cooldowns=Cooldowns(drug=0),
    ))
    return client


@pytest.fixture
def mock_store_leader():
    store = MagicMock()
    registered_keys = {
        123: {"player_id": 123, "player_name": "Leader", "api_key": "leader_key", "is_faction_key": True},
    }
    store.get_all_keys.return_value = list(registered_keys.values())
    store.get_key.side_effect = lambda player_id: registered_keys.get(player_id)
    store.get_faction_key.return_value = {"player_id": 123, "player_name": "Leader", "api_key": "leader_key"}
    store.has_key.side_effect = lambda player_id: player_id in registered_keys
    return store


@pytest.mark.asyncio
async def test_detail_full_access_sees_all(mock_client_yata, mock_store_leader):
    import api.main as _main
    _main._bars_cache = {123: {"energy": 150, "max_energy": 150, "drug_cd": 0}}
    try:
        with patch("api.main.torn_client", mock_client_yata), patch("api.main.key_store", mock_store_leader):
            from api.main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                resp = await ac.get("/api/members/detail", headers=auth_headers(123, "Leader"))
        assert resp.status_code == 200
        data = resp.json()
        assert data["yata_down"] is False
        assert "123" in data["members"]
        assert "456" in data["members"]
        assert data["members"]["123"]["source"] == "torn_api"
        assert data["members"]["123"]["energy"] == 150
        assert data["members"]["123"]["max_energy"] == 150
        assert data["members"]["456"]["source"] == "yata"
        assert data["members"]["456"]["energy"] == 120
        assert data["members"]["456"]["max_energy"] is None
    finally:
        _main._bars_cache = {}


@pytest.fixture
def mock_store_member():
    store = MagicMock()
    registered_keys = {
        456: {"player_id": 456, "player_name": "Member1", "api_key": "member_key", "is_faction_key": False},
    }
    store.get_all_keys.return_value = list(registered_keys.values())
    store.get_key.side_effect = lambda player_id: registered_keys.get(player_id)
    store.get_faction_key.return_value = None
    store.has_key.side_effect = lambda player_id: player_id in registered_keys
    return store


@pytest.mark.asyncio
async def test_detail_self_only_sees_self(mock_client_yata, mock_store_member):
    with patch("api.main.torn_client", mock_client_yata), patch("api.main.key_store", mock_store_member):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail", headers=auth_headers(456, "Member1"))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["members"]) == 1
    assert "456" in data["members"]
    assert "123" not in data["members"]


@pytest.mark.asyncio
async def test_detail_yata_down(mock_client_yata, mock_store_leader):
    import api.main as _main
    _main._bars_cache = {123: {"energy": 150, "max_energy": 150, "drug_cd": 0}}
    mock_client_yata.fetch_yata_members = AsyncMock(return_value=None)
    try:
        with patch("api.main.torn_client", mock_client_yata), patch("api.main.key_store", mock_store_leader):
            from api.main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                resp = await ac.get("/api/members/detail", headers=auth_headers(123, "Leader"))
        assert resp.status_code == 200
        data = resp.json()
        assert data["yata_down"] is True
        assert "123" in data["members"]
        assert data["members"]["123"]["source"] == "torn_api"
        # Player 456 exists in faction but has no key and YATA is down
        assert "456" in data["members"]
        assert data["members"]["456"]["source"] == "unavailable"
    finally:
        _main._bars_cache = {}


@pytest.mark.asyncio
async def test_me_admin(mock_client, mock_store):
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store), \
         patch("api.main.SUPERADMIN_ID", 123):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/me", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_id"] == 123
    assert data["is_admin"] is True
    assert data["is_superadmin"] is True
    assert data["role"] == "superadmin"


@pytest.mark.asyncio
async def test_me_non_admin(mock_client, mock_store):
    mock_store.is_admin = MagicMock(return_value=False)
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store), \
         patch("api.main.SUPERADMIN_ID", 9999):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/me", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_id"] == 123
    assert data["is_admin"] is False
    assert data["is_superadmin"] is False
    assert data["role"] == "member"


@pytest.mark.asyncio
async def test_detail_yata_sharing_flags(mock_client_yata, mock_store_leader):
    yata_data = {
        "123": {**FAKE_YATA["123"], "energy_share": 1},
        "456": {**FAKE_YATA["456"], "energy_share": -1},
        "789": {**FAKE_YATA["456"], "id": 789, "name": "NotOnYata", "energy_share": 0},
    }
    mock_client_yata.fetch_yata_members = AsyncMock(return_value=yata_data)
    mock_client_yata.fetch_members = AsyncMock(return_value=[
        _make_member(id=123, name="Leader", position="Leader"),
        _make_member(id=456, name="Hidden", position="Team 1"),
        _make_member(id=789, name="NotOnYata", position="Team 2"),
    ])
    with patch("api.main.torn_client", mock_client_yata), patch("api.main.key_store", mock_store_leader):
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail", headers=auth_headers(123, "Leader"))
    assert resp.status_code == 200
    data = resp.json()
    assert data["members"]["456"]["source"] == "hidden"
    assert data["members"]["789"]["source"] == "not_on_yata"




@pytest.mark.asyncio
async def test_stakeout_delete_requires_registered_member(mock_client, mock_store):
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.stakeout as stakeout_mod
        original_has_key = stakeout_mod.key_store.has_key if stakeout_mod.key_store else None
        stakeout_mod.stakeout_repo = MagicMock()
        stakeout_mod.key_store = mock_store
        mock_store.has_key.side_effect = lambda player_id: False if player_id == 123 else True
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.delete("/api/stakeout/555", headers=AUTH_HEADERS)
    assert resp.status_code == 401
    stakeout_mod.stakeout_repo.remove.assert_not_called()


@pytest.mark.asyncio
async def test_notifications_are_scoped_to_requesting_player(mock_client, mock_store):
    notification_repo = MagicMock()
    notification_repo.get_recent.return_value = [{"id": 1, "player_id": 123, "title": "Mine"}]
    notification_repo.get_unread_count.return_value = 2

    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.notifications as notifications_mod
        notifications_mod.notification_repo = notification_repo
        notifications_mod.key_store = mock_store
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/notifications", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    assert resp.json()["notifications"] == [{"id": 1, "player_id": 123, "title": "Mine"}]
    notification_repo.get_recent.assert_called_once_with(123, 50)
    notification_repo.get_unread_count.assert_called_with(123)


@pytest.mark.asyncio
async def test_notifications_read_operations_are_scoped_to_requesting_player(mock_client, mock_store):
    notification_repo = MagicMock()

    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.notifications as notifications_mod
        notifications_mod.notification_repo = notification_repo
        notifications_mod.key_store = mock_store
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            mark_one = await ac.post("/api/notifications/read/77", headers=AUTH_HEADERS)
            mark_all = await ac.post("/api/notifications/read-all", headers=AUTH_HEADERS)

    assert mark_one.status_code == 200
    assert mark_all.status_code == 200
    notification_repo.mark_read.assert_called_once_with(123, 77)
    notification_repo.mark_all_read.assert_called_once_with(123)


@pytest.mark.asyncio
async def test_company_catalog(mock_client, mock_store):
    mock_client.fetch_company_catalog = AsyncMock(return_value={
        "1": {"name": "Hair Salon", "cost": 500000, "default_employees": 3,
              "positions": [], "stock": [],
              "specials": [{"name": "Perm", "effect": "+2 happy", "cost": 1, "rating_required": 1}]}
    })
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.company as company_mod
        company_mod.torn_client = mock_client
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/company/catalog", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "companies" in data
    assert len(data["companies"]) == 1
    assert data["companies"][0]["name"] == "Hair Salon"


@pytest.mark.asyncio
async def test_company_faction(mock_client, mock_store):
    mock_store.get_all_keys.return_value = [
        {"player_id": 123, "player_name": "Bombel", "api_key": "key1"},
        {"player_id": 456, "player_name": "Tester", "api_key": "key2"},
    ]
    mock_client.fetch_training_data = AsyncMock(side_effect=[
        {"job": {"company_id": 100, "company_name": "Cool Farm", "company_type": 34, "position": "Farmer"}},
        {"job": {"company_id": 100, "company_name": "Cool Farm", "company_type": 34, "position": "Manager"}},
    ])
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.company as company_mod
        company_mod.torn_client = mock_client
        company_mod.key_store = mock_store
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/company/faction", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "companies" in data
    assert len(data["companies"]) == 1
    assert data["companies"][0]["company_name"] == "Cool Farm"
    assert len(data["companies"][0]["members"]) == 2


@pytest.mark.asyncio
async def test_push_vapid_key():
    with patch("api.main.torn_client", MagicMock()), \
         patch("api.main.key_store", MagicMock()):
        import api.routers.push as push_mod
        push_mod.vapid_public_key = "test_public_key_base64"
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/push/vapid-key", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    assert resp.json()["vapid_public_key"] == "test_public_key_base64"


@pytest.mark.asyncio
async def test_push_subscribe(mock_client, mock_store):
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.push as push_mod
        mock_push_repo = MagicMock()
        push_mod.push_repo = mock_push_repo
        push_mod.key_store = mock_store
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/push/subscribe", json={
                "endpoint": "https://push.example.com/abc",
                "keys": {"p256dh": "key123", "auth": "auth123"},
                "preferences": {"loot_level4": True, "war_start": True},
            }, headers=AUTH_HEADERS)
    assert resp.status_code == 200
    mock_push_repo.save.assert_called_once_with(
        player_id=123,
        endpoint="https://push.example.com/abc",
        p256dh="key123",
        auth="auth123",
        preferences={"loot_level4": True, "war_start": True},
    )


def test_chat_websocket_requires_valid_token(mock_store):
    manager = StubChatManager()
    with patch("api.routers.chat.chat_repo", object()), \
         patch("api.routers.chat.chat_manager", manager), \
         patch("api.routers.chat.key_store", mock_store), \
         patch("api.routers.chat.settings_repo", None), \
         patch("api.routers.chat.JWT_SECRET", TEST_JWT_SECRET):
        from api.routers.chat import router as chat_router

        app = FastAPI()
        app.include_router(chat_router)

        with TestClient(app) as client:
            with pytest.raises(WebSocketDisconnect) as excinfo:
                with client.websocket_connect("/api/chat/ws"):
                    pass
    assert excinfo.value.code == 4003
    assert manager.connected == []


def test_chat_websocket_accepts_session_token_and_maps_player_from_token(mock_store):
    manager = StubChatManager()
    session_token = create_jwt(123, "Test", TEST_JWT_SECRET, token_type="session")
    with patch("api.routers.chat.chat_repo", object()), \
         patch("api.routers.chat.chat_manager", manager), \
         patch("api.routers.chat.key_store", mock_store), \
         patch("api.routers.chat.settings_repo", None), \
         patch("api.routers.chat.JWT_SECRET", TEST_JWT_SECRET):
        from api.routers.chat import router as chat_router

        app = FastAPI()
        app.include_router(chat_router)

        with TestClient(app) as client:
            with client.websocket_connect(f"/api/chat/ws?token={session_token}&player_id=999") as websocket:
                assert manager.connected == [123]
                websocket.close()
    assert manager.disconnected == [123]


@pytest.mark.asyncio
async def test_middleware_logs_requests(mock_client, mock_store):
    from api.analytics import AnalyticsStore
    import os

    with tempfile.TemporaryDirectory() as tmp:
        real_analytics = AnalyticsStore(db_path=os.path.join(tmp, "test.db"))
        with patch("api.main.torn_client", mock_client), \
             patch("api.main.key_store", mock_store), \
             patch("api.main.analytics_store", real_analytics):
            from api.main import app
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                await ac.get("/api/overview", headers=AUTH_HEADERS)
        stats = real_analytics.get_request_stats(days=1)
        assert stats["total_requests"] >= 1
        users = real_analytics.get_user_stats(days=1)
        pids = {u["player_id"] for u in users}
        assert 123 in pids
