import os
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from api.db.migrations.runner import run_migrations
from api.db.repos.notification_templates import NotificationTemplateRepository
from api.db.repos.notification_events import NotificationEventRepository
from api.db.repos.custom_groups import CustomGroupRepository
from api.db.repos.push_repository import PushRepository


@pytest.fixture
def repos(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return {
        "template_repo": NotificationTemplateRepository(db_path=db_path),
        "event_repo": NotificationEventRepository(db_path=db_path),
        "group_repo": CustomGroupRepository(db_path=db_path),
        "push_repo": PushRepository(db_path=db_path),
    }


@pytest.fixture
def client(repos):
    from fastapi import FastAPI
    from api.routers import admin_push as admin_push_mod
    from api.admin import require_admin

    admin_push_mod.template_repo = repos["template_repo"]
    admin_push_mod.event_repo = repos["event_repo"]
    admin_push_mod.group_repo = repos["group_repo"]

    dispatcher = MagicMock()
    dispatcher.send.return_value = 1
    admin_push_mod.dispatcher = dispatcher

    app = FastAPI()
    from api.routers.admin_push import router
    app.include_router(router)

    # Override the dependency to bypass JWT auth
    async def fake_admin():
        return {"sub": 2362436, "role": "superadmin"}

    app.dependency_overrides[require_admin] = fake_admin
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_templates(client):
    resp = client.get("/api/admin/push/templates")
    assert resp.status_code == 200
    assert len(resp.json()["templates"]) >= 4  # seeded templates


def test_create_template(client):
    resp = client.post("/api/admin/push/templates", json={
        "name": "New Template",
        "title_template": "Hello {{name}}",
        "body_template": "Welcome {{name}}",
        "url_template": "/welcome",
    })
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_send_notification(client):
    resp = client.post("/api/admin/push/send", json={
        "title": "Test notification",
        "body": "Test body",
        "url": "/test",
        "target_type": "all",
    })
    assert resp.status_code == 200
    assert resp.json()["event_id"] == 1


def test_send_test_to_self(client):
    resp = client.post("/api/admin/push/test")
    assert resp.status_code == 200


def test_list_history(client, repos):
    repos["event_repo"].create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None, sent_by="system", variables_used={},
    )
    resp = client.get("/api/admin/push/history")
    assert resp.status_code == 200
    assert len(resp.json()["events"]) >= 1


def test_create_group(client):
    resp = client.post("/api/admin/push/groups", json={
        "name": "War Team",
        "description": "Active war fighters",
        "member_ids": [100, 200],
    })
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_list_groups(client):
    resp = client.get("/api/admin/push/groups")
    assert resp.status_code == 200
