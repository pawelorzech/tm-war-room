import pytest
from api.db import KeyStore


@pytest.fixture
def key_store(tmp_path):
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    return KeyStore(db_path=str(tmp_path / "test.db"), encryption_key=key)


def test_no_admins_initially(key_store):
    assert key_store.get_admins() == []


def test_is_admin_false_by_default(key_store):
    assert key_store.is_admin(12345) is False


def test_promote_and_check(key_store):
    key_store.promote_admin(12345, granted_by=2362436)
    assert key_store.is_admin(12345) is True
    admins = key_store.get_admins()
    assert len(admins) == 1
    assert admins[0]["player_id"] == 12345
    assert admins[0]["granted_by"] == 2362436


def test_demote(key_store):
    key_store.promote_admin(12345, granted_by=2362436)
    key_store.demote_admin(12345)
    assert key_store.is_admin(12345) is False
    assert key_store.get_admins() == []


def test_promote_idempotent(key_store):
    key_store.promote_admin(12345, granted_by=2362436)
    key_store.promote_admin(12345, granted_by=2362436)
    assert len(key_store.get_admins()) == 1
