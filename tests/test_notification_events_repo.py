import os
import pytest
from api.db.migrations.runner import run_migrations
from api.db.repos.notification_events import NotificationEventRepository


@pytest.fixture
def event_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return NotificationEventRepository(db_path=db_path)


def test_create_event(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="Test", body="Body",
        url="/test", icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    assert eid > 0
    ev = event_repo.get_event(eid)
    assert ev["title"] == "Test"
    assert ev["target_type"] == "all"


def test_create_delivery_and_get_pending(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url="/t", icon=None,
        target_type="player", target_value="123",
        sent_by="system", variables_used={},
    )
    event_repo.create_delivery(eid, player_id=123, channel="pda")
    event_repo.create_delivery(eid, player_id=456, channel="webpush")

    pending = event_repo.get_pending_pda(player_id=123)
    assert len(pending) == 1
    assert pending[0]["title"] == "T"
    assert pending[0]["event_id"] == eid


def test_mark_delivered(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    did = event_repo.create_delivery(eid, player_id=123, channel="pda")
    event_repo.mark_delivered(did)
    pending = event_repo.get_pending_pda(player_id=123)
    assert len(pending) == 0


def test_mark_failed(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    did = event_repo.create_delivery(eid, player_id=123, channel="webpush")
    event_repo.mark_failed(did, "410 Gone")

    deliveries = event_repo.get_deliveries_for_event(eid)
    assert deliveries[0]["status"] == "failed"
    assert deliveries[0]["error_message"] == "410 Gone"


def test_list_events_paginated(event_repo):
    for i in range(5):
        event_repo.create_event(
            template_id=None, title=f"Event {i}", body="B", url=None, icon=None,
            target_type="all", target_value=None,
            sent_by="system", variables_used={},
        )
    page = event_repo.list_events(limit=3, offset=0)
    assert len(page) == 3
    # Most recent first
    assert page[0]["title"] == "Event 4"


def test_event_stats(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    d1 = event_repo.create_delivery(eid, 100, "webpush")
    d2 = event_repo.create_delivery(eid, 200, "pda")
    d3 = event_repo.create_delivery(eid, 300, "webpush")
    event_repo.mark_delivered(d1)
    event_repo.mark_failed(d3, "error")

    stats = event_repo.get_event_stats(eid)
    assert stats["delivered"] == 1
    assert stats["pending"] == 1
    assert stats["failed"] == 1
