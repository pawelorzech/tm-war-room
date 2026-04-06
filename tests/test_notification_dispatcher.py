import json
import pytest
from unittest.mock import MagicMock, patch, call


def _make_dispatcher(**overrides):
    from api.notification_dispatcher import NotificationDispatcher
    defaults = dict(
        push_service=MagicMock(),
        push_repo=MagicMock(),
        event_repo=MagicMock(),
        group_repo=MagicMock(),
        key_store=MagicMock(),
    )
    defaults.update(overrides)
    return NotificationDispatcher(**defaults)


def test_resolve_variables():
    from api.notification_dispatcher import _resolve_template
    result = _resolve_template("Hello {{name}}, welcome to {{place}}", {"name": "Bombel", "place": "TM"})
    assert result == "Hello Bombel, welcome to TM"


def test_resolve_variables_missing_key():
    from api.notification_dispatcher import _resolve_template
    result = _resolve_template("Hello {{name}}", {})
    assert result == "Hello {{name}}"


def test_send_to_player():
    push_repo = MagicMock()
    push_repo.get_by_player.return_value = [
        {"player_id": 123, "endpoint": "https://push/a", "p256dh": "k", "auth": "a", "channel": "webpush"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 1
    event_repo.create_delivery.return_value = 10
    push_service = MagicMock()

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(
        title="Test", body="Body", url="/test",
        target_type="player", target_value="123",
        sent_by="system",
    )

    event_repo.create_event.assert_called_once()
    event_repo.create_delivery.assert_called_once_with(1, 123, "webpush")


def test_send_to_all():
    push_repo = MagicMock()
    push_repo.get_all_subscribers.return_value = [
        {"player_id": 100, "channel": "webpush"},
        {"player_id": 200, "channel": "pda"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 5
    event_repo.create_delivery.side_effect = [10, 11]
    push_service = MagicMock()

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(
        title="Broadcast", body="Hello all", url=None,
        target_type="all", target_value=None,
        sent_by="2362436",
    )

    assert event_repo.create_delivery.call_count == 2


def test_send_to_group():
    push_repo = MagicMock()
    push_repo.get_by_player.side_effect = [
        [{"player_id": 100, "channel": "webpush"}],
        [{"player_id": 200, "channel": "pda"}],
    ]
    group_repo = MagicMock()
    group_repo.get_player_ids.return_value = [100, 200]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 3
    event_repo.create_delivery.side_effect = [10, 11]

    d = _make_dispatcher(push_repo=push_repo, group_repo=group_repo, event_repo=event_repo)
    d.send(
        title="Group msg", body="Body", url=None,
        target_type="group", target_value="1",
        sent_by="system",
    )

    group_repo.get_player_ids.assert_called_once_with(1)
    assert event_repo.create_delivery.call_count == 2


def test_webpush_delivery_marks_success():
    push_repo = MagicMock()
    push_repo.get_by_player.return_value = [
        {"player_id": 123, "endpoint": "https://push/a", "p256dh": "k", "auth": "a", "channel": "webpush"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 1
    event_repo.create_delivery.return_value = 10
    push_service = MagicMock()
    push_service.enabled = True

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(title="T", body="B", url=None, target_type="player", target_value="123", sent_by="system")

    # WebPush delivery should be attempted and marked delivered
    push_service._send_to_subs.assert_called_once()
    event_repo.mark_delivered.assert_called_once_with(10)


def test_pda_delivery_stays_pending():
    push_repo = MagicMock()
    push_repo.get_by_player.return_value = [
        {"player_id": 123, "channel": "pda"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 1
    event_repo.create_delivery.return_value = 10
    push_service = MagicMock()

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(title="T", body="B", url=None, target_type="player", target_value="123", sent_by="system")

    # PDA delivery stays pending — picked up by polling
    push_service._send_to_subs.assert_not_called()
    event_repo.mark_delivered.assert_not_called()
