import os
import pytest
from cryptography.fernet import Fernet

from app.db import KeyStore


@pytest.fixture
def store(tmp_path):
    db_path = str(tmp_path / "test.db")
    key = Fernet.generate_key().decode()
    return KeyStore(db_path=db_path, encryption_key=key)


def test_store_and_retrieve_key(store):
    store.save_key(player_id=123, player_name="TestPlayer", api_key="abc123secret")
    result = store.get_all_keys()
    assert len(result) == 1
    assert result[0]["player_id"] == 123
    assert result[0]["player_name"] == "TestPlayer"
    assert result[0]["api_key"] == "abc123secret"


def test_delete_key(store):
    store.save_key(player_id=123, player_name="TestPlayer", api_key="abc123secret")
    store.delete_key(player_id=123)
    result = store.get_all_keys()
    assert len(result) == 0


def test_update_existing_key(store):
    store.save_key(player_id=123, player_name="TestPlayer", api_key="old_key")
    store.save_key(player_id=123, player_name="TestPlayer", api_key="new_key")
    result = store.get_all_keys()
    assert len(result) == 1
    assert result[0]["api_key"] == "new_key"


def test_keys_are_encrypted_in_db(store):
    store.save_key(player_id=123, player_name="Test", api_key="plaintext_secret")
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    row = conn.execute("SELECT api_key_encrypted FROM member_keys WHERE player_id = 123").fetchone()
    conn.close()
    assert row[0] != "plaintext_secret"
    assert row[0] != b"plaintext_secret"
