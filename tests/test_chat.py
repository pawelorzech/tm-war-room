import os
import pytest
import sqlite3
from api.db.repos.chat import ChatRepository
from api.db.migrations.runner import run_migrations


@pytest.fixture
def chat_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    # Run all migrations to create the schema
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return ChatRepository(db_path)


# ── Channels ──────────────────────────────────────────────────

class TestChannels:
    def test_default_channels_seeded(self, chat_repo):
        channels = chat_repo.get_channels()
        names = [c["name"] for c in channels]
        assert "general" in names
        assert "war-room" in names
        assert "trading" in names
        assert "off-topic" in names
        assert "announcements" in names

    def test_create_channel(self, chat_repo):
        cid = chat_repo.create_channel(
            name="test-channel", description="Test", ch_type="chat",
            position=10, admin_only=False, created_by=123,
        )
        assert cid > 0
        ch = chat_repo.get_channel(cid)
        assert ch["name"] == "test-channel"
        assert ch["type"] == "chat"
        assert ch["admin_only"] == 0

    def test_create_duplicate_channel_fails(self, chat_repo):
        chat_repo.create_channel("unique", "", "chat", 0, False, 1)
        with pytest.raises(Exception):
            chat_repo.create_channel("unique", "", "chat", 0, False, 1)

    def test_update_channel(self, chat_repo):
        cid = chat_repo.create_channel("update-test", "", "chat", 0, False, 1)
        chat_repo.update_channel(cid, name="updated", description="new desc")
        ch = chat_repo.get_channel(cid)
        assert ch["name"] == "updated"
        assert ch["description"] == "new desc"

    def test_delete_channel(self, chat_repo):
        cid = chat_repo.create_channel("delete-me", "", "chat", 0, False, 1)
        chat_repo.create_message(cid, 1, "test", "hello")
        chat_repo.delete_channel(cid)
        assert chat_repo.get_channel(cid) is None
        assert chat_repo.get_messages(cid) == []

    def test_get_channel_by_name(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        assert ch is not None
        assert ch["name"] == "general"
        assert chat_repo.get_channel_by_name("nonexistent") is None


# ── Messages ──────────────────────────────────────────────────

class TestMessages:
    def test_create_and_get_messages(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(ch["id"], 100, "Alice", "Hello world")
        assert msg["id"] > 0
        assert msg["content"] == "Hello world"
        assert msg["player_name"] == "Alice"

        messages = chat_repo.get_messages(ch["id"])
        assert len(messages) == 1
        assert messages[0]["content"] == "Hello world"

    def test_messages_order(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        chat_repo.create_message(ch["id"], 1, "A", "first")
        chat_repo.create_message(ch["id"], 2, "B", "second")
        chat_repo.create_message(ch["id"], 3, "C", "third")
        messages = chat_repo.get_messages(ch["id"])
        assert [m["content"] for m in messages] == ["first", "second", "third"]

    def test_messages_pagination(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        ids = []
        for i in range(5):
            m = chat_repo.create_message(ch["id"], 1, "A", f"msg-{i}")
            ids.append(m["id"])
        # Get last 2
        messages = chat_repo.get_messages(ch["id"], limit=2)
        assert len(messages) == 2
        assert messages[-1]["content"] == "msg-4"
        # Get before the 4th message
        messages = chat_repo.get_messages(ch["id"], before_id=ids[3], limit=2)
        assert len(messages) == 2
        assert messages[-1]["content"] == "msg-2"

    def test_edit_message(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(ch["id"], 100, "Alice", "original")
        assert chat_repo.edit_message(msg["id"], 100, "edited") is True
        messages = chat_repo.get_messages(ch["id"])
        assert messages[0]["content"] == "edited"
        assert messages[0]["edited_at"] is not None

    def test_edit_message_wrong_player(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(ch["id"], 100, "Alice", "original")
        assert chat_repo.edit_message(msg["id"], 999, "hacked") is False

    def test_delete_message_by_owner(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(ch["id"], 100, "Alice", "delete me")
        result = chat_repo.delete_message(msg["id"], 100, is_admin=False)
        assert result is not None
        messages = chat_repo.get_messages(ch["id"])
        assert len(messages) == 0  # Soft deleted, not returned

    def test_delete_message_by_admin(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(ch["id"], 100, "Alice", "bad msg")
        result = chat_repo.delete_message(msg["id"], 999, is_admin=True)
        assert result is not None

    def test_delete_message_unauthorized(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(ch["id"], 100, "Alice", "mine")
        result = chat_repo.delete_message(msg["id"], 999, is_admin=False)
        assert result is None

    def test_pin_message(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(ch["id"], 100, "Alice", "pin me")
        assert chat_repo.pin_message(msg["id"], True) is True
        pinned = chat_repo.get_pinned_messages(ch["id"])
        assert len(pinned) == 1
        assert pinned[0]["id"] == msg["id"]
        # Unpin
        chat_repo.pin_message(msg["id"], False)
        assert chat_repo.get_pinned_messages(ch["id"]) == []

    def test_message_with_mentions(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        msg = chat_repo.create_message(
            ch["id"], 100, "Alice", "hey @Bob @Carol",
            mentions=[200, 300],
        )
        assert msg["mentions"] == [200, 300]
        messages = chat_repo.get_messages(ch["id"])
        assert messages[0]["mentions"] == [200, 300]

    def test_message_with_bot(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        bot_id = chat_repo.create_bot("TestBot", "token123", "*", 1)
        msg = chat_repo.create_message(
            ch["id"], 0, "TestBot", "automated msg", bot_id=bot_id,
        )
        assert msg["bot_id"] == bot_id
        assert msg["player_id"] == 0


# ── Threads ───────────────────────────────────────────────────

class TestThreads:
    def test_create_thread(self, chat_repo):
        ch = chat_repo.get_channel_by_name("announcements")
        thread = chat_repo.create_thread(
            ch["id"], "First Thread", 100, "Alice", "Thread body content",
        )
        assert thread["id"] > 0
        assert thread["title"] == "First Thread"
        # First message is auto-created
        messages = chat_repo.get_thread_messages(thread["id"])
        assert len(messages) == 1
        assert messages[0]["content"] == "Thread body content"

    def test_list_threads(self, chat_repo):
        ch = chat_repo.get_channel_by_name("announcements")
        chat_repo.create_thread(ch["id"], "Thread 1", 1, "A", "body1")
        chat_repo.create_thread(ch["id"], "Thread 2", 2, "B", "body2")
        threads = chat_repo.get_threads(ch["id"])
        assert len(threads) == 2

    def test_thread_messages(self, chat_repo):
        ch = chat_repo.get_channel_by_name("announcements")
        thread = chat_repo.create_thread(ch["id"], "Discussion", 100, "Alice", "Start")
        chat_repo.create_message(ch["id"], 200, "Bob", "Reply 1", thread_id=thread["id"])
        chat_repo.create_message(ch["id"], 300, "Carol", "Reply 2", thread_id=thread["id"])
        messages = chat_repo.get_thread_messages(thread["id"])
        assert len(messages) == 3
        assert messages[0]["content"] == "Start"
        assert messages[2]["content"] == "Reply 2"

    def test_lock_thread(self, chat_repo):
        ch = chat_repo.get_channel_by_name("announcements")
        thread = chat_repo.create_thread(ch["id"], "Lock Me", 100, "Alice", "body")
        chat_repo.lock_thread(thread["id"], True)
        t = chat_repo.get_thread(thread["id"])
        assert t["locked"] == 1
        chat_repo.lock_thread(thread["id"], False)
        t = chat_repo.get_thread(thread["id"])
        assert t["locked"] == 0

    def test_pin_thread(self, chat_repo):
        ch = chat_repo.get_channel_by_name("announcements")
        thread = chat_repo.create_thread(ch["id"], "Pin Me", 100, "Alice", "body")
        chat_repo.pin_thread(thread["id"], True)
        t = chat_repo.get_thread(thread["id"])
        assert t["pinned"] == 1

    def test_thread_messages_not_in_channel_messages(self, chat_repo):
        """Thread messages should not appear in channel-level messages."""
        ch = chat_repo.get_channel_by_name("general")
        chat_repo.create_message(ch["id"], 1, "A", "channel msg")
        thread = chat_repo.create_thread(ch["id"], "Thread", 2, "B", "thread msg")
        chat_repo.create_message(ch["id"], 3, "C", "thread reply", thread_id=thread["id"])
        # Channel messages should only have the direct message
        ch_msgs = chat_repo.get_messages(ch["id"])
        assert len(ch_msgs) == 1
        assert ch_msgs[0]["content"] == "channel msg"


# ── Read Tracking ─────────────────────────────────────────────

class TestReadTracking:
    def test_unread_counts(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        chat_repo.create_message(ch["id"], 1, "A", "msg1")
        msg2 = chat_repo.create_message(ch["id"], 2, "B", "msg2")
        chat_repo.create_message(ch["id"], 3, "C", "msg3")
        # Player 100 hasn't read anything
        counts = chat_repo.get_unread_counts(100)
        assert counts[ch["id"]] == 3
        # Mark up to msg2 as read
        chat_repo.update_read_position(100, ch["id"], msg2["id"])
        counts = chat_repo.get_unread_counts(100)
        assert counts[ch["id"]] == 1  # Only msg3 is unread

    def test_read_position_upsert(self, chat_repo):
        ch = chat_repo.get_channel_by_name("general")
        m1 = chat_repo.create_message(ch["id"], 1, "A", "msg1")
        m2 = chat_repo.create_message(ch["id"], 2, "B", "msg2")
        chat_repo.update_read_position(100, ch["id"], m1["id"])
        chat_repo.update_read_position(100, ch["id"], m2["id"])
        counts = chat_repo.get_unread_counts(100)
        assert counts[ch["id"]] == 0


# ── Mutes ─────────────────────────────────────────────────────

class TestMutes:
    def test_mute_and_check(self, chat_repo):
        assert chat_repo.is_muted(100) is False
        chat_repo.mute_player(100, muted_by=1, reason="spam")
        assert chat_repo.is_muted(100) is True

    def test_unmute(self, chat_repo):
        chat_repo.mute_player(100, muted_by=1)
        chat_repo.unmute_player(100)
        assert chat_repo.is_muted(100) is False

    def test_expired_mute(self, chat_repo):
        import time
        # Mute with already-expired timestamp
        chat_repo.mute_player(100, muted_by=1, muted_until=int(time.time()) - 1)
        assert chat_repo.is_muted(100) is False


# ── Bots ──────────────────────────────────────────────────────

class TestBots:
    def test_create_and_get_bot(self, chat_repo):
        bot_id = chat_repo.create_bot("ReviveBot", "secret-token", "*", 1)
        assert bot_id > 0
        bot = chat_repo.get_bot_by_token("secret-token")
        assert bot is not None
        assert bot["name"] == "ReviveBot"
        assert bot["active"] == 1

    def test_invalid_token(self, chat_repo):
        assert chat_repo.get_bot_by_token("nonexistent") is None

    def test_inactive_bot(self, chat_repo):
        bot_id = chat_repo.create_bot("InactiveBot", "inactive-token", "*", 1)
        chat_repo.update_bot(bot_id, active=0)
        assert chat_repo.get_bot_by_token("inactive-token") is None

    def test_list_bots(self, chat_repo):
        chat_repo.create_bot("Bot1", "t1", "*", 1)
        chat_repo.create_bot("Bot2", "t2", "[1,2]", 1)
        bots = chat_repo.get_bots()
        assert len(bots) == 2
        # Token should NOT be in the list
        assert "token" not in bots[0]

    def test_delete_bot(self, chat_repo):
        bot_id = chat_repo.create_bot("DeleteMe", "del-token", "*", 1)
        chat_repo.delete_bot(bot_id)
        assert chat_repo.get_bot_by_token("del-token") is None

    def test_update_bot(self, chat_repo):
        bot_id = chat_repo.create_bot("OldName", "upd-token", "*", 1)
        chat_repo.update_bot(bot_id, name="NewName", allowed_channels="[1]")
        bot = chat_repo.get_bot_by_token("upd-token")
        assert bot["name"] == "NewName"
        assert bot["allowed_channels"] == "[1]"
