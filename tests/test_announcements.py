import pytest
from api.db import KeyStore

@pytest.fixture
def key_store(tmp_path):
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    return KeyStore(db_path=str(tmp_path / "test.db"), encryption_key=key)

def test_create_and_get_active(key_store):
    ann_id = key_store.create_announcement("info", "Test message", created_by=1)
    active = key_store.get_active_announcements()
    assert len(active) == 1
    assert active[0]["id"] == ann_id
    assert active[0]["type"] == "info"
    assert active[0]["message"] == "Test message"

def test_revoke_removes_from_active(key_store):
    ann_id = key_store.create_announcement("warning", "Revokable", created_by=1)
    key_store.revoke_announcement(ann_id, revoked_by=1, reason="done")
    assert key_store.get_active_announcements() == []

def test_revoked_still_in_all(key_store):
    ann_id = key_store.create_announcement("info", "Old news", created_by=1)
    key_store.revoke_announcement(ann_id, revoked_by=1, reason="outdated")
    all_anns = key_store.get_all_announcements()
    assert len(all_anns) == 1
    assert all_anns[0]["revoked_at"] is not None
    assert all_anns[0]["revoke_reason"] == "outdated"

def test_alerts_sorted_first(key_store):
    key_store.create_announcement("info", "Info msg", created_by=1)
    key_store.create_announcement("alert", "URGENT", created_by=1)
    active = key_store.get_active_announcements()
    assert active[0]["type"] == "alert"

def test_revoke_nonexistent_returns_false(key_store):
    assert key_store.revoke_announcement(999, revoked_by=1) is False

def test_expired_not_in_active(key_store):
    key_store.create_announcement("info", "Expired", created_by=1, expires_at="2020-01-01 00:00:00")
    assert key_store.get_active_announcements() == []
