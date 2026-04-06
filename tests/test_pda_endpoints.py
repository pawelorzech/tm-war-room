import os
import json
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from api.db.migrations.runner import run_migrations
from api.db.repos.push_repository import PushRepository
from api.db.repos.notification_events import NotificationEventRepository


@pytest.fixture
def repos(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    push_repo = PushRepository(db_path=db_path)
    event_repo = NotificationEventRepository(db_path=db_path)
    return push_repo, event_repo


@pytest.fixture
def client(repos):
    from fastapi import FastAPI
    from api.routers import push as push_mod
    push_repo, event_repo = repos
    push_mod.push_repo = push_repo
    push_mod.event_repo = event_repo
    push_mod.push_service = MagicMock(enabled=True)
    push_mod.vapid_public_key = "test-key"

    app = FastAPI()
    app.include_router(push_mod.router)
    return TestClient(app)


def test_pda_register(client, repos):
    push_repo, _ = repos
    resp = client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1
    assert subs[0]["channel"] == "pda"
    assert subs[0]["endpoint"] == "pda:123"


def test_pda_register_idempotent(client, repos):
    push_repo, _ = repos
    client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1


def test_pda_poll_empty(client):
    resp = client.get("/api/push/pda/poll", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    assert resp.json()["events"] == []


def test_pda_poll_returns_pending(client, repos):
    _, event_repo = repos
    eid = event_repo.create_event(
        template_id=None, title="War!", body="Get ready", url="/wars", icon=None,
        target_type="all", target_value=None, sent_by="system", variables_used={},
    )
    event_repo.create_delivery(eid, player_id=123, channel="pda")

    resp = client.get("/api/push/pda/poll", headers={"X-Player-Id": "123"})
    data = resp.json()
    assert len(data["events"]) == 1
    assert data["events"][0]["title"] == "War!"

    # Second poll should be empty (marked delivered)
    resp2 = client.get("/api/push/pda/poll", headers={"X-Player-Id": "123"})
    assert resp2.json()["events"] == []


def test_pda_unregister(client, repos):
    push_repo, _ = repos
    client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    resp = client.delete("/api/push/pda/unregister", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    assert push_repo.get_by_player(123) == []
