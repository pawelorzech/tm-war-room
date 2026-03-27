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


def test_get_keys_metadata(store):
    store.save_key(player_id=123, player_name="Player1", api_key="key1")
    store.save_key(player_id=456, player_name="Player2", api_key="key2", is_faction_key=True)
    meta = store.get_keys_metadata()
    assert len(meta) == 2
    p1 = next(m for m in meta if m["player_id"] == 123)
    assert p1["player_name"] == "Player1"
    assert p1["is_faction_key"] is False
    assert "created_at" in p1
    assert "api_key" not in p1  # no decrypted key
    p2 = next(m for m in meta if m["player_id"] == 456)
    assert p2["is_faction_key"] is True
