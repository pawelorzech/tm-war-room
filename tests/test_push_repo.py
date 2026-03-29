import json
import os
import pytest
from api.db.migrations.runner import run_migrations
from api.db.repos.push_repository import PushRepository


@pytest.fixture
def push_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return PushRepository(db_path=db_path)


def test_save_and_get_subscription(push_repo):
    push_repo.save(
        player_id=123,
        endpoint="https://push.example.com/abc",
        p256dh="key123",
        auth="auth123",
        preferences={"loot_level4": True, "war_start": False},
    )
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1
    assert subs[0]["endpoint"] == "https://push.example.com/abc"
    prefs = json.loads(subs[0]["preferences"])
    assert prefs["loot_level4"] is True


def test_get_by_preference(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {"loot_level4": True, "war_start": True})
    push_repo.save(456, "https://push.example.com/b", "k2", "a2", {"loot_level4": False, "war_start": True})
    push_repo.save(789, "https://push.example.com/c", "k3", "a3", {"loot_level4": True, "war_start": False})

    loot_subs = push_repo.get_by_preference("loot_level4")
    assert len(loot_subs) == 2
    assert {s["player_id"] for s in loot_subs} == {123, 789}

    war_subs = push_repo.get_by_preference("war_start")
    assert len(war_subs) == 2
    assert {s["player_id"] for s in war_subs} == {123, 456}


def test_update_preferences(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {"loot_level4": True})
    push_repo.update_preferences(123, {"loot_level4": False, "war_start": True})
    subs = push_repo.get_by_player(123)
    prefs = json.loads(subs[0]["preferences"])
    assert prefs["loot_level4"] is False
    assert prefs["war_start"] is True


def test_delete_by_endpoint(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {})
    push_repo.delete_by_endpoint("https://push.example.com/a")
    assert push_repo.get_by_player(123) == []


def test_upsert_same_endpoint(push_repo):
    push_repo.save(123, "https://push.example.com/a", "k1", "a1", {"loot_level4": True})
    push_repo.save(123, "https://push.example.com/a", "k2", "a2", {"loot_level4": False})
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1
    assert subs[0]["p256dh"] == "k2"
