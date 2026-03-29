"""Tests for TargetRepository from api/db/repos/targets.py."""
import pytest
from api.db.repos.targets import TargetRepository

TARGETS_DDL = """
CREATE TABLE IF NOT EXISTS targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    added_by INTEGER NOT NULL,
    added_by_name TEXT,
    tag TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    difficulty TEXT DEFAULT 'unknown',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id)
);
"""


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    r = TargetRepository(db_path)
    r.mutate(TARGETS_DDL)
    return r


class TestAddTarget:
    def test_add_single_target(self, repo):
        repo.add_target(player_id=100, player_name="Target1", added_by=1, added_by_name="Admin")
        targets = repo.get_all()
        assert len(targets) == 1
        assert targets[0]["player_id"] == 100
        assert targets[0]["player_name"] == "Target1"
        assert targets[0]["added_by"] == 1

    def test_add_target_with_tag_and_notes(self, repo):
        repo.add_target(player_id=200, player_name="Target2", added_by=1,
                        added_by_name="Admin", tag="war", notes="Easy hit", difficulty="easy")
        targets = repo.get_all()
        assert targets[0]["tag"] == "war"
        assert targets[0]["notes"] == "Easy hit"
        assert targets[0]["difficulty"] == "easy"

    def test_add_duplicate_upserts(self, repo):
        """Adding the same player_id again updates rather than errors."""
        repo.add_target(player_id=100, player_name="OldName", added_by=1,
                        added_by_name="Admin", tag="old")
        repo.add_target(player_id=100, player_name="NewName", added_by=2,
                        added_by_name="Admin2", tag="new")
        targets = repo.get_all()
        assert len(targets) == 1
        assert targets[0]["player_name"] == "NewName"
        assert targets[0]["tag"] == "new"

    def test_add_target_default_values(self, repo):
        repo.add_target(player_id=300, player_name="T3", added_by=1, added_by_name="Admin")
        t = repo.get_all()[0]
        assert t["tag"] == ""
        assert t["notes"] == ""
        assert t["difficulty"] == "unknown"


class TestRemoveTarget:
    def test_remove_existing_target(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A")
        repo.add_target(player_id=200, player_name="T2", added_by=1, added_by_name="A")
        repo.remove_target(100)
        targets = repo.get_all()
        assert len(targets) == 1
        assert targets[0]["player_id"] == 200

    def test_remove_nonexistent_target_no_error(self, repo):
        """Removing a player_id that doesn't exist should not raise."""
        repo.remove_target(999)
        assert repo.get_count() == 0


class TestUpdateTarget:
    def test_update_tag(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A", tag="old")
        repo.update_target(player_id=100, tag="new_tag")
        t = repo.get_all()[0]
        assert t["tag"] == "new_tag"

    def test_update_notes(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A")
        repo.update_target(player_id=100, notes="Updated notes")
        t = repo.get_all()[0]
        assert t["notes"] == "Updated notes"

    def test_update_difficulty(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A")
        repo.update_target(player_id=100, difficulty="hard")
        t = repo.get_all()[0]
        assert t["difficulty"] == "hard"

    def test_update_multiple_fields_at_once(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A")
        repo.update_target(player_id=100, tag="war", notes="Big target", difficulty="impossible")
        t = repo.get_all()[0]
        assert t["tag"] == "war"
        assert t["notes"] == "Big target"
        assert t["difficulty"] == "impossible"

    def test_update_no_fields_is_noop(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A", tag="original")
        repo.update_target(player_id=100)  # No fields
        t = repo.get_all()[0]
        assert t["tag"] == "original"


class TestGetAll:
    def test_get_all_empty(self, repo):
        assert repo.get_all() == []

    def test_get_all_returns_dicts(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A")
        targets = repo.get_all()
        assert isinstance(targets[0], dict)

    def test_get_all_returns_all_targets(self, repo):
        repo.add_target(player_id=100, player_name="First", added_by=1, added_by_name="A")
        repo.add_target(player_id=200, player_name="Second", added_by=1, added_by_name="A")
        repo.add_target(player_id=300, player_name="Third", added_by=1, added_by_name="A")
        targets = repo.get_all()
        assert len(targets) == 3
        ids = {t["player_id"] for t in targets}
        assert ids == {100, 200, 300}

    def test_get_count(self, repo):
        assert repo.get_count() == 0
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A")
        repo.add_target(player_id=200, player_name="T2", added_by=1, added_by_name="A")
        assert repo.get_count() == 2


class TestGetByTag:
    def test_get_by_tag_filters_correctly(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A", tag="war")
        repo.add_target(player_id=200, player_name="T2", added_by=1, added_by_name="A", tag="loot")
        repo.add_target(player_id=300, player_name="T3", added_by=1, added_by_name="A", tag="war")
        war_targets = repo.get_by_tag("war")
        assert len(war_targets) == 2
        assert all(t["tag"] == "war" for t in war_targets)

    def test_get_by_tag_no_matches(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A", tag="war")
        assert repo.get_by_tag("nonexistent") == []


class TestGetTags:
    def test_get_tags_returns_distinct(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A", tag="war")
        repo.add_target(player_id=200, player_name="T2", added_by=1, added_by_name="A", tag="war")
        repo.add_target(player_id=300, player_name="T3", added_by=1, added_by_name="A", tag="loot")
        tags = repo.get_tags()
        assert sorted(tags) == ["loot", "war"]

    def test_get_tags_excludes_empty_string(self, repo):
        repo.add_target(player_id=100, player_name="T1", added_by=1, added_by_name="A", tag="")
        repo.add_target(player_id=200, player_name="T2", added_by=1, added_by_name="A", tag="war")
        tags = repo.get_tags()
        assert tags == ["war"]

    def test_get_tags_empty_table(self, repo):
        assert repo.get_tags() == []
