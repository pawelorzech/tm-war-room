"""Tests for LootReservationRepository from api/db/repos/loot_reservations.py."""
import pytest
from api.db.repos.loot_reservations import LootReservationRepository

RESERVATIONS_DDL = """
CREATE TABLE IF NOT EXISTS loot_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id INTEGER NOT NULL,
    npc_name TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    target_level INTEGER DEFAULT 4,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(npc_id, player_id)
);
"""


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    r = LootReservationRepository(db_path)
    r.mutate(RESERVATIONS_DDL)
    return r


class TestReserve:
    def test_basic_reservation(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        all_res = repo.get_all()
        assert len(all_res) == 1
        assert all_res[0]["npc_id"] == 4
        assert all_res[0]["npc_name"] == "Duke"
        assert all_res[0]["player_id"] == 100
        assert all_res[0]["player_name"] == "Alice"
        assert all_res[0]["target_level"] == 4

    def test_reserve_with_custom_target_level(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice", target_level=5)
        assert repo.get_all()[0]["target_level"] == 5

    def test_reserve_duplicate_upserts_level(self, repo):
        """Same npc_id + player_id should update target_level."""
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice", target_level=4)
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice", target_level=5)
        all_res = repo.get_all()
        assert len(all_res) == 1
        assert all_res[0]["target_level"] == 5

    def test_reserve_multiple_players_same_npc(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        repo.reserve(npc_id=4, npc_name="Duke", player_id=200, player_name="Bob")
        assert repo.get_count() == 2

    def test_reserve_same_player_different_npcs(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        repo.reserve(npc_id=15, npc_name="Leslie", player_id=100, player_name="Alice")
        assert repo.get_count() == 2


class TestCancel:
    def test_cancel_existing_reservation(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        repo.reserve(npc_id=4, npc_name="Duke", player_id=200, player_name="Bob")
        repo.cancel(npc_id=4, player_id=100)
        remaining = repo.get_all()
        assert len(remaining) == 1
        assert remaining[0]["player_id"] == 200

    def test_cancel_nonexistent_no_error(self, repo):
        repo.cancel(npc_id=999, player_id=999)
        assert repo.get_count() == 0

    def test_cancel_only_affects_specific_combo(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        repo.reserve(npc_id=15, npc_name="Leslie", player_id=100, player_name="Alice")
        repo.cancel(npc_id=4, player_id=100)
        remaining = repo.get_all()
        assert len(remaining) == 1
        assert remaining[0]["npc_id"] == 15


class TestClearNpc:
    def test_clear_all_reservations_for_npc(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        repo.reserve(npc_id=4, npc_name="Duke", player_id=200, player_name="Bob")
        repo.reserve(npc_id=4, npc_name="Duke", player_id=300, player_name="Carol")
        repo.clear_npc(npc_id=4)
        assert repo.get_count() == 0

    def test_clear_npc_does_not_affect_other_npcs(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        repo.reserve(npc_id=15, npc_name="Leslie", player_id=200, player_name="Bob")
        repo.clear_npc(npc_id=4)
        remaining = repo.get_all()
        assert len(remaining) == 1
        assert remaining[0]["npc_id"] == 15

    def test_clear_npc_nonexistent_no_error(self, repo):
        repo.clear_npc(npc_id=999)
        assert repo.get_count() == 0


class TestGetForNpc:
    def test_returns_reservations_for_specific_npc(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice", target_level=4)
        repo.reserve(npc_id=4, npc_name="Duke", player_id=200, player_name="Bob", target_level=5)
        repo.reserve(npc_id=15, npc_name="Leslie", player_id=300, player_name="Carol")
        npc4 = repo.get_for_npc(4)
        assert len(npc4) == 2
        assert all(r["npc_id"] == 4 for r in npc4)

    def test_ordered_by_target_level_desc(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice", target_level=3)
        repo.reserve(npc_id=4, npc_name="Duke", player_id=200, player_name="Bob", target_level=5)
        repo.reserve(npc_id=4, npc_name="Duke", player_id=300, player_name="Carol", target_level=4)
        npc4 = repo.get_for_npc(4)
        levels = [r["target_level"] for r in npc4]
        assert levels == [5, 4, 3]

    def test_empty_when_no_reservations(self, repo):
        assert repo.get_for_npc(4) == []


class TestGetAll:
    def test_get_all_empty(self, repo):
        assert repo.get_all() == []

    def test_get_all_returns_dicts(self, repo):
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        all_res = repo.get_all()
        assert isinstance(all_res[0], dict)

    def test_get_all_ordered_by_npc_then_level(self, repo):
        repo.reserve(npc_id=15, npc_name="Leslie", player_id=100, player_name="A", target_level=3)
        repo.reserve(npc_id=4, npc_name="Duke", player_id=200, player_name="B", target_level=5)
        repo.reserve(npc_id=4, npc_name="Duke", player_id=300, player_name="C", target_level=4)
        all_res = repo.get_all()
        # Ordered by npc_id ASC, then target_level DESC
        assert all_res[0]["npc_id"] == 4
        assert all_res[0]["target_level"] == 5
        assert all_res[1]["npc_id"] == 4
        assert all_res[1]["target_level"] == 4
        assert all_res[2]["npc_id"] == 15

    def test_get_count(self, repo):
        assert repo.get_count() == 0
        repo.reserve(npc_id=4, npc_name="Duke", player_id=100, player_name="Alice")
        repo.reserve(npc_id=15, npc_name="Leslie", player_id=200, player_name="Bob")
        assert repo.get_count() == 2
