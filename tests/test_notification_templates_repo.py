import json
import os
import pytest
from api.db.migrations.runner import run_migrations
from api.db.repos.notification_templates import NotificationTemplateRepository


@pytest.fixture
def tmpl_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return NotificationTemplateRepository(db_path=db_path)


def test_seeded_templates_exist(tmpl_repo):
    templates = tmpl_repo.get_all()
    assert len(templates) >= 4
    names = {t["name"] for t in templates}
    assert {"War Alert", "Maintenance", "Chain Alert", "Custom"} <= names


def test_create_template(tmpl_repo):
    tid = tmpl_repo.create(
        name="Test Template",
        title_template="Hello {{name}}",
        body_template="Welcome {{name}} to {{place}}",
        url_template="/test",
        icon=None,
        created_by=123,
    )
    assert tid > 0
    t = tmpl_repo.get_by_id(tid)
    assert t["name"] == "Test Template"
    assert t["title_template"] == "Hello {{name}}"
    variables = json.loads(t["variables"])
    assert set(variables) == {"name", "place"}


def test_update_template(tmpl_repo):
    tid = tmpl_repo.create(
        name="Old Name",
        title_template="{{a}}",
        body_template="{{b}}",
        url_template=None,
        icon=None,
        created_by=123,
    )
    tmpl_repo.update(tid, name="New Name", title_template="{{x}}", body_template="{{y}}")
    t = tmpl_repo.get_by_id(tid)
    assert t["name"] == "New Name"
    variables = json.loads(t["variables"])
    assert set(variables) == {"x", "y"}


def test_delete_template(tmpl_repo):
    tid = tmpl_repo.create(
        name="To Delete", title_template="t", body_template="b",
        url_template=None, icon=None, created_by=123,
    )
    tmpl_repo.delete(tid)
    assert tmpl_repo.get_by_id(tid) is None
