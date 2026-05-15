import os
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.db.migrations.runner import run_migrations
from api.db.repos.war_off_limits import WarOffLimitsRepository


# ---------- Repository tests ----------


@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return WarOffLimitsRepository(db_path=db_path)


def test_add_and_get(repo):
    assert repo.add(war_id=1, player_id=42, player_name="Foo", set_by=99, set_by_name="Bombel", reason="med-out")
    row = repo.get(1, 42)
    assert row is not None
    assert row["player_name"] == "Foo"
    assert row["set_by"] == 99
    assert row["set_by_name"] == "Bombel"
    assert row["reason"] == "med-out"


def test_add_duplicate_returns_false(repo):
    assert repo.add(war_id=1, player_id=42, player_name="Foo", set_by=99, set_by_name="Bombel", reason="x")
    assert not repo.add(war_id=1, player_id=42, player_name="Foo", set_by=100, set_by_name="Other", reason="y")
    row = repo.get(1, 42)
    assert row["set_by"] == 99  # original survives


def test_same_player_different_war_ok(repo):
    assert repo.add(war_id=1, player_id=42, player_name="Foo", set_by=99, set_by_name="A", reason="")
    assert repo.add(war_id=2, player_id=42, player_name="Foo", set_by=99, set_by_name="A", reason="")
    assert repo.get(1, 42) is not None
    assert repo.get(2, 42) is not None


def test_list_for_war_isolates_wars(repo):
    repo.add(war_id=1, player_id=42, player_name="Foo", set_by=99, set_by_name="A", reason="")
    repo.add(war_id=1, player_id=43, player_name="Bar", set_by=99, set_by_name="A", reason="")
    repo.add(war_id=2, player_id=44, player_name="Baz", set_by=99, set_by_name="A", reason="")
    assert len(repo.list_for_war(1)) == 2
    assert len(repo.list_for_war(2)) == 1
    assert repo.list_for_war(999) == []


def test_update_reason(repo):
    repo.add(war_id=1, player_id=42, player_name="Foo", set_by=99, set_by_name="A", reason="initial")
    assert repo.update_reason(1, 42, "updated reason") is True
    row = repo.get(1, 42)
    assert row["reason"] == "updated reason"


def test_update_reason_missing_returns_false(repo):
    assert repo.update_reason(1, 42, "x") is False


def test_delete(repo):
    repo.add(war_id=1, player_id=42, player_name="Foo", set_by=99, set_by_name="A", reason="")
    assert repo.delete(1, 42) is True
    assert repo.get(1, 42) is None
    assert repo.delete(1, 42) is False  # already gone


# ---------- Router tests ----------


class _FakeKeyStore:
    """Minimal stub for the key_store dependency used by the router."""

    def __init__(self, members: dict[int, dict], admins: set[int] | None = None):
        self._members = members
        self._admins = admins or set()

    def has_key(self, player_id: int) -> bool:
        return player_id in self._members

    def get_key(self, player_id: int) -> dict | None:
        return self._members.get(player_id)

    def is_admin(self, player_id: int) -> bool:
        return player_id in self._admins


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)

    from api.routers import war_off_limits as mod

    mod.repo = WarOffLimitsRepository(db_path=db_path)
    mod.key_store = _FakeKeyStore(
        members={
            100: {"player_id": 100, "player_name": "Owner"},
            200: {"player_id": 200, "player_name": "Stranger"},
            300: {"player_id": 300, "player_name": "Admin"},
        },
        admins={300},
    )

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def _headers(pid: int) -> dict[str, str]:
    return {"X-Player-Id": str(pid)}


def test_post_creates_entry(client):
    resp = client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy", "reason": "med-out for chain leader"},
        headers=_headers(100),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "ok"

    list_resp = client.get("/api/war-off-limits/777", headers=_headers(100))
    body = list_resp.json()
    assert body["count"] == 1
    assert body["entries"][0]["set_by"] == 100
    assert body["entries"][0]["set_by_name"] == "Owner"
    assert body["entries"][0]["reason"] == "med-out for chain leader"


def test_post_unauthenticated_returns_401(client):
    resp = client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy"},
        headers=_headers(9999),  # not in members
    )
    assert resp.status_code == 401


def test_post_blank_name_rejected(client):
    resp = client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "   "},
        headers=_headers(100),
    )
    assert resp.status_code == 400


def test_post_duplicate_returns_409(client):
    body = {"player_id": 42, "player_name": "EnemyGuy", "reason": "x"}
    assert client.post("/api/war-off-limits/777", json=body, headers=_headers(100)).status_code == 200
    second = client.post("/api/war-off-limits/777", json=body, headers=_headers(200))
    assert second.status_code == 409


def test_patch_owner_can_edit(client):
    client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy", "reason": "old"},
        headers=_headers(100),
    )
    resp = client.patch(
        "/api/war-off-limits/777/42",
        json={"reason": "new"},
        headers=_headers(100),
    )
    assert resp.status_code == 200
    listed = client.get("/api/war-off-limits/777", headers=_headers(100)).json()
    assert listed["entries"][0]["reason"] == "new"


def test_patch_stranger_forbidden(client):
    client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy", "reason": "old"},
        headers=_headers(100),
    )
    resp = client.patch(
        "/api/war-off-limits/777/42",
        json={"reason": "hacked"},
        headers=_headers(200),
    )
    assert resp.status_code == 403


def test_patch_admin_can_edit_others(client):
    client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy", "reason": "old"},
        headers=_headers(100),
    )
    resp = client.patch(
        "/api/war-off-limits/777/42",
        json={"reason": "moderated by admin"},
        headers=_headers(300),
    )
    assert resp.status_code == 200


def test_patch_missing_returns_404(client):
    resp = client.patch(
        "/api/war-off-limits/777/9999",
        json={"reason": "x"},
        headers=_headers(100),
    )
    assert resp.status_code == 404


def test_delete_owner_ok(client):
    client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy"},
        headers=_headers(100),
    )
    resp = client.delete("/api/war-off-limits/777/42", headers=_headers(100))
    assert resp.status_code == 200
    assert client.get("/api/war-off-limits/777", headers=_headers(100)).json()["count"] == 0


def test_delete_stranger_forbidden(client):
    client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy"},
        headers=_headers(100),
    )
    resp = client.delete("/api/war-off-limits/777/42", headers=_headers(200))
    assert resp.status_code == 403


def test_delete_admin_can_delete_others(client):
    client.post(
        "/api/war-off-limits/777",
        json={"player_id": 42, "player_name": "EnemyGuy"},
        headers=_headers(100),
    )
    resp = client.delete("/api/war-off-limits/777/42", headers=_headers(300))
    assert resp.status_code == 200
