from __future__ import annotations

import sqlite3

import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from api.armoury import parse_deposit_news, matches_category, matches_any_category, matches_competition

# ---------------------------------------------------------------------------
# 1. Parser tests
# ---------------------------------------------------------------------------


class TestParseDepositNews:
    def test_basic_blood_bag(self):
        html = '<a href = "http://www.torn.com/profiles.php?XID=1234567">TestPlayer</a> deposited 10 x Blood Bag : O+'
        result = parse_deposit_news(html)
        assert result == (1234567, "TestPlayer", 10, "Blood Bag : O+")

    def test_multiple_quantity(self):
        html = '<a href = "http://www.torn.com/profiles.php?XID=9999">Bombel</a> deposited 205 x Bottle of Beer'
        result = parse_deposit_news(html)
        assert result == (9999, "Bombel", 205, "Bottle of Beer")

    def test_single_quantity_temporary(self):
        html = '<a href = "http://www.torn.com/profiles.php?XID=42">Foo</a> deposited 1 x Epinephrine'
        result = parse_deposit_news(html)
        assert result == (42, "Foo", 1, "Epinephrine")

    def test_non_deposit_usage_returns_none(self):
        html = '<a href = "http://www.torn.com/profiles.php?XID=42">Foo</a> used one of the faction\'s Blood Bag : A+ items'
        assert parse_deposit_news(html) is None

    def test_empty_string_returns_none(self):
        assert parse_deposit_news("") is None

    def test_garbage_text_returns_none(self):
        assert parse_deposit_news("random garbage that is not HTML") is None


class TestMatchesCategory:
    # blood_bags
    def test_blood_bag_o_positive(self):
        assert matches_category("Blood Bag : O+", "blood_bags") is True

    def test_blood_bag_irradiated(self):
        assert matches_category("Blood Bag : Irradiated", "blood_bags") is True

    def test_empty_blood_bag_excluded(self):
        assert matches_category("Empty Blood Bag", "blood_bags") is False

    # temporary
    def test_epinephrine_is_temporary(self):
        assert matches_category("Epinephrine", "temporary") is True

    def test_melatonin_is_temporary(self):
        assert matches_category("Melatonin", "temporary") is True

    def test_xanax_not_temporary(self):
        assert matches_category("Xanax", "temporary") is False

    # alcohol
    def test_bottle_of_beer(self):
        assert matches_category("Bottle of Beer", "alcohol") is True

    def test_glass_of_beer(self):
        assert matches_category("Glass of Beer", "alcohol") is True

    def test_bottle_of_sake(self):
        assert matches_category("Bottle of Saké", "alcohol") is True

    def test_can_of_munster_not_alcohol(self):
        assert matches_category("Can of Munster", "alcohol") is False

    def test_blood_bag_not_alcohol(self):
        assert matches_category("Blood Bag : A+", "alcohol") is False

    # invalid category
    def test_invalid_category_returns_false(self):
        assert matches_category("Bottle of Beer", "drugs") is False


class TestMatchesAnyCategory:
    def test_single_category(self):
        assert matches_any_category("Blood Bag : O+", "blood_bags") is True

    def test_comma_separated_match_first(self):
        assert matches_any_category("Blood Bag : O+", "blood_bags,temporary") is True

    def test_comma_separated_match_second(self):
        assert matches_any_category("Epinephrine", "blood_bags,temporary") is True

    def test_comma_separated_no_match(self):
        assert matches_any_category("Xanax", "blood_bags,temporary") is False

    def test_spaces_around_commas(self):
        assert matches_any_category("Bottle of Beer", "blood_bags, alcohol") is True

    def test_all_three(self):
        assert matches_any_category("Melatonin", "alcohol,blood_bags,temporary") is True


class TestMatchesCompetition:
    def test_category_only_match(self):
        assert matches_competition("Xanax", "drugs", None) is True

    def test_category_only_no_match(self):
        assert matches_competition("Xanax", "blood_bags", None) is False

    def test_items_only_match(self):
        assert matches_competition("Xanax", None, "Xanax,LSD") is True

    def test_items_only_no_match(self):
        assert matches_competition("Cannabis", None, "Xanax,LSD") is False

    def test_both_match_via_category(self):
        assert matches_competition("Xanax", "drugs", "LSD") is True

    def test_both_match_via_items(self):
        assert matches_competition("Xanax", "blood_bags", "Xanax,LSD") is True

    def test_both_no_match(self):
        assert matches_competition("Xanax", "blood_bags", "Epinephrine") is False

    def test_empty_category_and_items(self):
        assert matches_competition("Xanax", "", None) is False

    def test_empty_strings(self):
        assert matches_competition("Xanax", "", "") is False

    def test_items_with_spaces(self):
        assert matches_competition("Xanax", None, "LSD, Xanax, PCP") is True


# ---------------------------------------------------------------------------
# 2. Repository tests
# ---------------------------------------------------------------------------

MIGRATION_PATHS = [
    "api/db/migrations/032_armoury_competitions.sql",
    "api/db/migrations/033_armoury_prizes_and_multicategory.sql",
    "api/db/migrations/034_deposits_unique_per_competition.sql",
    "api/db/migrations/035_armoury_items.sql",
]


@pytest.fixture
def repo(tmp_path):
    from api.db.repos.armoury import ArmouryRepository

    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    for path in MIGRATION_PATHS:
        with open(path) as f:
            conn.executescript(f.read())
    conn.close()
    return ArmouryRepository(db_path=db_path)


class TestArmouryRepository:
    def test_create_competition_returns_positive_id(self, repo):
        comp_id = repo.create_competition("Test Comp", "blood_bags", 1000, 2000, 42)
        assert comp_id > 0

    def test_get_competition_by_id(self, repo):
        comp_id = repo.create_competition("BB Comp", "blood_bags", 1000, 2000, 42)
        comp = repo.get_competition(comp_id)
        assert comp is not None
        assert comp["name"] == "BB Comp"
        assert comp["category"] == "blood_bags"
        assert comp["status"] == "active"
        assert comp["start_ts"] == 1000
        assert comp["end_ts"] == 2000
        assert comp["created_by"] == 42

    def test_get_competition_nonexistent(self, repo):
        assert repo.get_competition(9999) is None

    def test_get_active_competitions(self, repo):
        repo.create_competition("Active 1", "blood_bags", 1000, 2000, 1)
        repo.create_competition("Active 2", "temporary", 1100, 2100, 1)
        comp3 = repo.create_competition("To End", "alcohol", 900, 1900, 1)
        repo.end_competition(comp3)

        active = repo.get_active_competitions()
        assert len(active) == 2
        names = {c["name"] for c in active}
        assert names == {"Active 1", "Active 2"}

    def test_get_all_competitions_active_first(self, repo):
        repo.create_competition("Active", "blood_bags", 1000, 2000, 1)
        ended_id = repo.create_competition("Ended", "temporary", 900, 1900, 1)
        repo.end_competition(ended_id)

        all_comps = repo.get_all_competitions()
        assert len(all_comps) == 2
        assert all_comps[0]["status"] == "active"
        assert all_comps[1]["status"] == "ended"

    def test_end_competition(self, repo):
        comp_id = repo.create_competition("Ending", "blood_bags", 1000, 2000, 1)
        repo.end_competition(comp_id)
        comp = repo.get_competition(comp_id)
        assert comp["status"] == "ended"

    def test_insert_deposit(self, repo):
        comp_id = repo.create_competition("Comp", "blood_bags", 1000, 2000, 1)
        dep_id = repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : O+", 10, 1500, "news_001")
        assert dep_id > 0

    def test_insert_deposit_dedup(self, repo):
        comp_id = repo.create_competition("Comp", "blood_bags", 1000, 2000, 1)
        repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : O+", 10, 1500, "news_001")
        # Second insert with same news_id should be ignored (INSERT OR IGNORE)
        dep_id2 = repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : O+", 10, 1500, "news_001")
        # lastrowid returns 0 when no row is inserted (OR IGNORE)
        assert dep_id2 == 0

        # Leaderboard should show only 10, not 20
        lb = repo.get_leaderboard(comp_id)
        assert len(lb) == 1
        assert lb[0]["total"] == 10

    def test_get_leaderboard_aggregates(self, repo):
        comp_id = repo.create_competition("Comp", "blood_bags", 1000, 2000, 1)
        repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : O+", 10, 1500, "news_001")
        repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : A+", 5, 1600, "news_002")

        lb = repo.get_leaderboard(comp_id)
        assert len(lb) == 1
        assert lb[0]["player_id"] == 42
        assert lb[0]["total"] == 15
        assert lb[0]["deposits"] == 2

    def test_get_leaderboard_ordered_desc(self, repo):
        comp_id = repo.create_competition("Comp", "blood_bags", 1000, 2000, 1)
        repo.insert_deposit(comp_id, 1, "Alice", "Blood Bag : O+", 5, 1500, "n1")
        repo.insert_deposit(comp_id, 2, "Bob", "Blood Bag : A+", 20, 1600, "n2")
        repo.insert_deposit(comp_id, 3, "Charlie", "Blood Bag : B+", 12, 1700, "n3")

        lb = repo.get_leaderboard(comp_id)
        assert len(lb) == 3
        assert lb[0]["player_id"] == 2  # Bob: 20
        assert lb[1]["player_id"] == 3  # Charlie: 12
        assert lb[2]["player_id"] == 1  # Alice: 5

    def test_get_last_poll_ts(self, repo):
        comp_id = repo.create_competition("Comp", "blood_bags", 1000, 2000, 1)
        repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : O+", 10, 1500, "n1")
        repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : A+", 5, 1700, "n2")

        last_ts = repo.get_last_poll_ts(comp_id)
        assert last_ts == 1700

    def test_get_last_poll_ts_empty(self, repo):
        comp_id = repo.create_competition("Comp", "blood_bags", 1000, 2000, 1)
        assert repo.get_last_poll_ts(comp_id) is None

    def test_overlapping_competitions_same_deposit(self, repo):
        """Same news_id can be recorded in two competitions independently."""
        comp1 = repo.create_competition("Comp 1", "blood_bags", 1000, 2000, 1)
        comp2 = repo.create_competition("Comp 2", "blood_bags", 1000, 2000, 1)
        repo.insert_deposit(comp1, 42, "Steven", "Blood Bag : O+", 10, 1500, "news_001")
        repo.insert_deposit(comp2, 42, "Steven", "Blood Bag : O+", 10, 1500, "news_001")

        lb1 = repo.get_leaderboard(comp1)
        lb2 = repo.get_leaderboard(comp2)
        assert len(lb1) == 1 and lb1[0]["total"] == 10
        assert len(lb2) == 1 and lb2[0]["total"] == 10

    def test_create_competition_with_items(self, repo):
        comp_id = repo.create_competition("Item Comp", "", 1000, 2000, 42, items="Xanax,LSD")
        comp = repo.get_competition(comp_id)
        assert comp is not None
        assert comp["items"] == "Xanax,LSD"
        assert comp["category"] == ""

    def test_create_competition_items_null_by_default(self, repo):
        comp_id = repo.create_competition("Cat Comp", "drugs", 1000, 2000, 42)
        comp = repo.get_competition(comp_id)
        assert comp["items"] is None

    def test_update_competition_items(self, repo):
        comp_id = repo.create_competition("Comp", "drugs", 1000, 2000, 42)
        repo.update_competition(comp_id, items="Xanax,LSD,PCP")
        comp = repo.get_competition(comp_id)
        assert comp["items"] == "Xanax,LSD,PCP"


# ---------------------------------------------------------------------------
# 3. Router tests
# ---------------------------------------------------------------------------


@pytest.fixture
def armoury_app(tmp_path):
    """Create a FastAPI test app with the armoury router wired to a temp DB."""
    import api.routers.armoury as armoury_mod
    from api.db.repos.armoury import ArmouryRepository

    db_path = str(tmp_path / "router_test.db")
    conn = sqlite3.connect(db_path)
    for path in MIGRATION_PATHS:
        with open(path) as f:
            conn.executescript(f.read())
    conn.close()

    armoury_repo = ArmouryRepository(db_path=db_path)

    mock_key_store = MagicMock()
    mock_key_store.has_key.return_value = True
    mock_key_store.is_admin.return_value = True

    # Save originals
    orig_repo = armoury_mod.repo
    orig_ks = armoury_mod.key_store
    orig_tc = armoury_mod.torn_client

    armoury_mod.repo = armoury_repo
    armoury_mod.key_store = mock_key_store
    armoury_mod.torn_client = MagicMock()

    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(armoury_mod.router)

    yield TestClient(app), mock_key_store, armoury_repo

    # Restore originals
    armoury_mod.repo = orig_repo
    armoury_mod.key_store = orig_ks
    armoury_mod.torn_client = orig_tc


class TestArmouryRoutes:
    def test_list_competitions_empty(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.get("/api/armoury/competitions", headers={"X-Player-Id": "123"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["competitions"] == []
        assert data["count"] == 0

    def test_list_competitions_after_create(self, armoury_app):
        client, _, _ = armoury_app
        headers = {"X-Player-Id": "123"}
        # Create a competition
        client.post(
            "/api/armoury/competitions",
            json={"name": "BB Comp", "categories": ["blood_bags"], "start_ts": 1000, "end_ts": 2000},
            headers=headers,
        )
        resp = client.get("/api/armoury/competitions", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["competitions"][0]["name"] == "BB Comp"

    def test_create_competition_admin(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.post(
            "/api/armoury/competitions",
            json={"name": "New Comp", "categories": ["temporary"], "start_ts": 1000, "end_ts": 2000},
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "created"
        assert data["id"] > 0

    def test_create_competition_non_admin_403(self, armoury_app):
        client, mock_ks, _ = armoury_app
        mock_ks.is_admin.return_value = False
        resp = client.post(
            "/api/armoury/competitions",
            json={"name": "Comp", "categories": ["blood_bags"], "start_ts": 1000, "end_ts": 2000},
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 403

    def test_create_competition_invalid_category_400(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.post(
            "/api/armoury/competitions",
            json={"name": "Comp", "categories": ["invalid_cat"], "start_ts": 1000, "end_ts": 2000},
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 400

    def test_leaderboard_empty(self, armoury_app):
        client, _, armoury_repo = armoury_app
        headers = {"X-Player-Id": "123"}
        # Create a competition directly via repo
        comp_id = armoury_repo.create_competition("Comp", "blood_bags", 1000, 2000, 42)
        resp = client.get(f"/api/armoury/competitions/{comp_id}/leaderboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["leaderboard"] == []
        assert data["total_deposited"] == 0
        assert data["participants"] == 0

    def test_leaderboard_not_found(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.get("/api/armoury/competitions/9999/leaderboard", headers={"X-Player-Id": "123"})
        assert resp.status_code == 404

    def test_end_competition_admin(self, armoury_app):
        client, _, armoury_repo = armoury_app
        headers = {"X-Player-Id": "123"}
        comp_id = armoury_repo.create_competition("Comp", "blood_bags", 1000, 2000, 42)
        resp = client.post(f"/api/armoury/competitions/{comp_id}/end", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ended"

        # Verify it actually ended
        comp = armoury_repo.get_competition(comp_id)
        assert comp["status"] == "ended"

    def test_end_competition_non_admin_403(self, armoury_app):
        client, mock_ks, armoury_repo = armoury_app
        comp_id = armoury_repo.create_competition("Comp", "blood_bags", 1000, 2000, 42)
        mock_ks.is_admin.return_value = False
        resp = client.post(
            f"/api/armoury/competitions/{comp_id}/end",
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 403

    def test_create_competition_items_only(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.post(
            "/api/armoury/competitions",
            json={"name": "Item Comp", "items": ["Xanax", "LSD"], "start_ts": 1000, "end_ts": 2000},
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "created"

    def test_create_competition_categories_and_items(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.post(
            "/api/armoury/competitions",
            json={"name": "Mixed", "categories": ["blood_bags"], "items": ["Xanax"], "start_ts": 1000, "end_ts": 2000},
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 200

    def test_create_competition_no_categories_no_items_400(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.post(
            "/api/armoury/competitions",
            json={"name": "Empty", "categories": [], "items": [], "start_ts": 1000, "end_ts": 2000},
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 400

    def test_list_categories(self, armoury_app):
        client, _, _ = armoury_app
        resp = client.get("/api/armoury/categories", headers={"X-Player-Id": "123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "drugs" in data["categories"]
        assert "Xanax" in data["categories"]["drugs"]

    def test_debug_endpoint_admin(self, armoury_app):
        client, _, armoury_repo = armoury_app
        headers = {"X-Player-Id": "123"}
        comp_id = armoury_repo.create_competition("Comp", "blood_bags", 1000, 2000, 42)
        armoury_repo.insert_deposit(comp_id, 42, "Bombel", "Blood Bag : O+", 10, 1500, "n1")
        armoury_repo.insert_deposit(comp_id, 99, "Steven", "Blood Bag : A+", 5, 1600, "n2")
        resp = client.get(f"/api/armoury/competitions/{comp_id}/debug", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_deposits"] == 2
        assert data["unique_players"] == 2
        assert "42" in data["by_player"]
        assert "99" in data["by_player"]

    def test_debug_endpoint_non_admin_403(self, armoury_app):
        client, mock_ks, armoury_repo = armoury_app
        comp_id = armoury_repo.create_competition("Comp", "blood_bags", 1000, 2000, 42)
        mock_ks.is_admin.return_value = False
        resp = client.get(
            f"/api/armoury/competitions/{comp_id}/debug",
            headers={"X-Player-Id": "123"},
        )
        assert resp.status_code == 403

    def test_unregistered_user_401(self, armoury_app):
        client, mock_ks, _ = armoury_app
        mock_ks.has_key.return_value = False
        resp = client.get("/api/armoury/competitions", headers={"X-Player-Id": "123"})
        assert resp.status_code == 401
