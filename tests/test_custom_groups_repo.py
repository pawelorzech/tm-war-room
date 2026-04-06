import os
import pytest
from api.db.migrations.runner import run_migrations
from api.db.repos.custom_groups import CustomGroupRepository


@pytest.fixture
def group_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return CustomGroupRepository(db_path=db_path)


def test_create_group(group_repo):
    gid = group_repo.create("War Team", "Active war participants", created_by=123)
    assert gid > 0
    g = group_repo.get_by_id(gid)
    assert g["name"] == "War Team"


def test_add_and_list_members(group_repo):
    gid = group_repo.create("Team A", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.add_member(gid, 200)
    members = group_repo.get_members(gid)
    assert {m["player_id"] for m in members} == {100, 200}


def test_remove_member(group_repo):
    gid = group_repo.create("Team B", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.remove_member(gid, 100)
    assert group_repo.get_members(gid) == []


def test_list_groups_with_counts(group_repo):
    g1 = group_repo.create("G1", None, created_by=123)
    g2 = group_repo.create("G2", None, created_by=123)
    group_repo.add_member(g1, 100)
    group_repo.add_member(g1, 200)
    group_repo.add_member(g2, 300)

    groups = group_repo.list_all()
    counts = {g["name"]: g["member_count"] for g in groups}
    assert counts["G1"] == 2
    assert counts["G2"] == 1


def test_delete_group_cascades(group_repo):
    gid = group_repo.create("Temp", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.delete(gid)
    assert group_repo.get_by_id(gid) is None


def test_update_group(group_repo):
    gid = group_repo.create("Old", "old desc", created_by=123)
    group_repo.update(gid, name="New", description="new desc")
    g = group_repo.get_by_id(gid)
    assert g["name"] == "New"
    assert g["description"] == "new desc"


def test_duplicate_member_ignored(group_repo):
    gid = group_repo.create("Dups", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.add_member(gid, 100)  # should not raise
    members = group_repo.get_members(gid)
    assert len(members) == 1
