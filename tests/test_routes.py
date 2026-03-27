import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.models import FactionMember, WarStatus, MemberBars, Bar, Cooldowns, LastAction, MemberStatus, WarFaction, FactionInfo, PersonalStats


def _make_member(id: int = 123, name: str = "Test", status_state: str = "Okay", online: str = "Online") -> FactionMember:
    return FactionMember(
        id=id, name=name, level=50, days_in_faction=100,
        last_action=LastAction(status=online, timestamp=1774600000, relative="1 min ago"),
        status=MemberStatus(description=status_state, details=None, state=status_state, color="green", until=None),
        position="Team 1", is_on_wall=False, is_revivable=False, is_in_oc=False,
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
    return client


@pytest.fixture
def mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [{"player_id": 123, "player_name": "Test", "api_key": "fake_key"}]
    store.save_key = MagicMock()
    store.delete_key = MagicMock()
    return store


@pytest.mark.asyncio
async def test_overview(mock_client, mock_store):
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["members"]) == 1
    assert data["members"][0]["name"] == "Test"
    assert data["war"]["war_id"] == 100


@pytest.mark.asyncio
async def test_members_detail(mock_client, mock_store):
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["members"]) == 1
    assert data["members"][0]["bars"]["energy"]["current"] == 500


@pytest.mark.asyncio
async def test_register_key(mock_client, mock_store):
    validate_resp = AsyncMock()
    validate_resp.json.return_value = {"player_id": 999, "name": "NewPlayer"}
    validate_resp.raise_for_status = lambda: None
    mock_client._http = AsyncMock()
    mock_client._http.get = AsyncMock(return_value=validate_resp)

    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/keys", json={"api_key": "some_key"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_enemy_with_rw(mock_client, mock_store):
    mock_client.fetch_enemy_members = AsyncMock(return_value=[_make_member(id=999, name="Enemy1")])
    mock_client.fetch_faction_info = AsyncMock(return_value=FactionInfo(
        id=9420, name="The Pusheen Army", tag="TPA", respect=4000000,
        members_count=73, rank_name="Platinum", rank_level=16, best_chain=50000, wins=62))
    mock_client.fetch_tornstats_spy = AsyncMock(return_value={
        999: PersonalStats(xanax_taken=2000, refills=900, attacks_won=4000,
                           networth=5_000_000_000, highest_beaten=100, best_damage=6000,
                           best_kill_streak=90, damage_done=13_000_000)})
    # Baseline stats for relative threat (passed via baseline_pid query param)
    mock_client.fetch_personalstats = AsyncMock(return_value=PersonalStats(
        xanax_taken=3000, refills=1500, attacks_won=8000, defends_won=500,
        networth=11_000_000_000, highest_beaten=100, best_damage=7000,
        best_kill_streak=100, damage_done=20_000_000))
    mock_store.get_all_keys = MagicMock(return_value=[
        {"player_id": 123, "player_name": "bombel", "api_key": "fk", "is_faction_key": False}])

    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store), \
         patch("app.main.TORNSTATS_API_KEY", "fake_ts_key"):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/enemy?baseline_pid=123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["faction"]["name"] == "The Pusheen Army"
    assert len(data["members"]) == 1
    assert data["members"][0]["threat_score"] > 0
    assert "attack_url" in data["members"][0]
    assert data["threat_mode"] == "relative"
    assert data["threat_baseline"] == "bombel"
