import json
import pytest
from unittest.mock import MagicMock, patch


def test_dispatch_sends_to_matching_subscriptions():
    mock_repo = MagicMock()
    mock_repo.get_by_preference.return_value = [
        {"player_id": 123, "endpoint": "https://push.example.com/a", "p256dh": "k1", "auth": "a1", "preferences": '{"loot_level4": true}'},
        {"player_id": 456, "endpoint": "https://push.example.com/b", "p256dh": "k2", "auth": "a2", "preferences": '{"loot_level4": true}'},
    ]
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(
        push_repo=mock_repo,
        notification_repo=mock_notif_repo,
        vapid_private_key="test_key",
        vapid_claims={"sub": "mailto:test@example.com"},
    )

    with patch("api.push_service.webpush") as mock_wp:
        svc.dispatch("loot_level4", "NPC Loot!", "Duke reached Level 4", "/loot")

    assert mock_wp.call_count == 2
    assert mock_notif_repo.create.call_count == 2
    mock_notif_repo.create.assert_any_call(
        player_id=123,
        type="loot",
        title="NPC Loot!",
        message="Duke reached Level 4",
        data={"event_type": "loot_level4", "url": "/loot"},
    )
    mock_notif_repo.create.assert_any_call(
        player_id=456,
        type="loot",
        title="NPC Loot!",
        message="Duke reached Level 4",
        data={"event_type": "loot_level4", "url": "/loot"},
    )


def test_dispatch_removes_expired_subscriptions():
    mock_repo = MagicMock()
    mock_repo.get_by_preference.return_value = [
        {"player_id": 123, "endpoint": "https://push.example.com/expired", "p256dh": "k1", "auth": "a1", "preferences": "{}"},
    ]
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(mock_repo, mock_notif_repo, "test_key", {"sub": "mailto:test@example.com"})

    from pywebpush import WebPushException
    with patch("api.push_service.webpush", side_effect=WebPushException("Gone", response=MagicMock(status_code=410))):
        svc.dispatch("loot_level4", "Test", "Test", "/test")

    mock_repo.delete_by_endpoint.assert_called_once_with("https://push.example.com/expired")


def test_dispatch_disabled_when_no_vapid_key():
    mock_repo = MagicMock()
    mock_repo.get_by_preference.return_value = [
        {"player_id": 123, "endpoint": "https://push.example.com/a", "p256dh": "k1", "auth": "a1", "preferences": '{"loot_level4": true}'},
    ]
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(mock_repo, mock_notif_repo, vapid_private_key=None, vapid_claims={})

    svc.dispatch("loot_level4", "Test", "Test", "/test")
    mock_notif_repo.create.assert_called_once_with(
        player_id=123,
        type="loot",
        title="Test",
        message="Test",
        data={"event_type": "loot_level4", "url": "/test"},
    )
    mock_repo.get_by_preference.assert_called_once_with("loot_level4")


def test_dispatch_for_player_only():
    mock_repo = MagicMock()
    mock_repo.get_by_player_and_preference.return_value = [
        {"player_id": 123, "endpoint": "https://push.example.com/a", "p256dh": "k1", "auth": "a1", "preferences": '{"stakeout_change": true}'},
    ]
    mock_notif_repo = MagicMock()

    from api.push_service import PushService
    svc = PushService(mock_repo, mock_notif_repo, "test_key", {"sub": "mailto:test@example.com"})

    with patch("api.push_service.webpush") as mock_wp:
        svc.dispatch_to_player(123, "stakeout_change", "Target Online", "Player X is online", "/stakeout")

    assert mock_wp.call_count == 1
    mock_repo.get_by_player_and_preference.assert_called_once_with(123, "stakeout_change")
