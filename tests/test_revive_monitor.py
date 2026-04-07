import time
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from api.models import FactionMember, LastAction, MemberStatus
from api.bots.revive_monitor import run, _filter_revive_enabled, _format_message
import api.bots.revive_monitor as revive_mod


def _make_member(
    id: int = 1, name: str = "Player1",
    revive_setting: str = "No one",
) -> FactionMember:
    return FactionMember(
        id=id, name=name, level=50, days_in_faction=100,
        last_action=LastAction(status="Online", timestamp=1774600000, relative="1 min ago"),
        status=MemberStatus(description="Okay", details=None, state="Okay", color="green", until=None),
        position="Team 1", is_on_wall=False, is_revivable=False, is_in_oc=False,
        revive_setting=revive_setting,
    )


class TestFilterReviveEnabled:
    def test_filters_out_no_one(self):
        members = [
            _make_member(id=1, name="Safe", revive_setting="No one"),
            _make_member(id=2, name="Risky", revive_setting="Everyone"),
        ]
        result = _filter_revive_enabled(members)
        assert len(result) == 1
        assert result[0].id == 2

    def test_catches_friends_and_faction(self):
        members = [_make_member(id=1, revive_setting="Friends & faction")]
        result = _filter_revive_enabled(members)
        assert len(result) == 1

    def test_catches_unknown(self):
        members = [_make_member(id=1, revive_setting="Unknown")]
        result = _filter_revive_enabled(members)
        assert len(result) == 1

    def test_empty_when_all_safe(self):
        members = [
            _make_member(id=1, revive_setting="No one"),
            _make_member(id=2, revive_setting="No one"),
        ]
        result = _filter_revive_enabled(members)
        assert len(result) == 0


class TestFormatMessage:
    def test_war_mode_urgent(self):
        members = [_make_member(id=1, name="Risky", revive_setting="Everyone")]
        msg = _format_message(members, war_active=True)
        assert "WARNING" in msg
        assert "@Risky" in msg

    def test_peace_mode_gentle(self):
        members = [_make_member(id=1, name="Risky", revive_setting="Everyone")]
        msg = _format_message(members, war_active=False)
        assert "Revive reminder" in msg
        assert "@Risky" in msg

    def test_empty_list_all_clear(self):
        msg = _format_message([], war_active=False)
        assert "All clear" in msg

    def test_empty_list_war_all_clear(self):
        msg = _format_message([], war_active=True)
        assert "All clear" in msg

    def test_shows_revive_setting(self):
        members = [_make_member(id=1, name="P1", revive_setting="Friends & faction")]
        msg = _format_message(members, war_active=True)
        assert "Friends & faction" in msg

    def test_message_is_valid_utf8(self):
        """Ensure no surrogate characters that would break SQLite."""
        members = [_make_member(id=1, name="P1", revive_setting="Everyone")]
        for war in (True, False):
            msg = _format_message(members, war)
            msg.encode("utf-8")  # raises if surrogates present
        empty_msg = _format_message([], False)
        empty_msg.encode("utf-8")

    def test_multiple_members(self):
        members = [
            _make_member(id=1, name="P1", revive_setting="Everyone"),
            _make_member(id=2, name="P2", revive_setting="Friends & faction"),
        ]
        msg = _format_message(members, war_active=False)
        assert "@P1" in msg
        assert "@P2" in msg


@pytest.fixture
def mock_chat_repo():
    repo = MagicMock()
    repo.get_bot_by_name.return_value = {
        "id": 1, "name": "Revive Monitor", "active": 1,
        "token": "fake", "allowed_channels": "*",
    }
    repo.get_channel_by_name.return_value = {"id": 10, "name": "revives"}
    repo.create_message.return_value = {
        "id": 100, "channel_id": 10, "thread_id": None,
        "player_id": 0, "player_name": "Revive Monitor",
        "content": "test", "bot_id": 1, "mentions": [],
        "pinned": 0, "deleted": 0, "created_at": 1000, "edited_at": None,
    }
    return repo


@pytest.fixture
def mock_torn_client_for_bot():
    client = AsyncMock()
    client.fetch_members = AsyncMock(return_value=[
        _make_member(id=1, name="Safe", revive_setting="No one"),
        _make_member(id=2, name="Risky", revive_setting="Everyone"),
        _make_member(id=3, name="AlsoRisky", revive_setting="Friends & faction"),
    ])
    return client


@pytest.fixture
def mock_chat_manager():
    mgr = AsyncMock()
    mgr.broadcast = AsyncMock()
    return mgr


class TestRun:
    @pytest.mark.asyncio
    async def test_posts_message_with_risky_members(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        revive_mod._last_post_ts = 0.0
        with patch("api.bots.revive_monitor._notify_mentions_fn", new_callable=AsyncMock) as mock_notify:
            result = await revive_mod.run(
                torn_client=mock_torn_client_for_bot,
                chat_repo=mock_chat_repo,
                chat_manager=mock_chat_manager,
                war_active=True,
                force=True,
            )
        assert result["posted"] is True
        assert result["risky_count"] == 2
        mock_chat_repo.create_message.assert_called_once()
        call_kwargs = mock_chat_repo.create_message.call_args
        assert 2 in call_kwargs.kwargs["mentions"]
        assert 3 in call_kwargs.kwargs["mentions"]

    @pytest.mark.asyncio
    async def test_throttled_in_peacetime(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        revive_mod._last_post_ts = time.time()  # just posted
        result = await revive_mod.run(
            torn_client=mock_torn_client_for_bot,
            chat_repo=mock_chat_repo,
            chat_manager=mock_chat_manager,
            war_active=False,
            force=False,
        )
        assert result["posted"] is False
        assert "Throttled" in result["message"]

    @pytest.mark.asyncio
    async def test_throttled_during_war(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        """War mode throttles to 1 hour (3600s) by default."""
        revive_mod._last_post_ts = time.time()  # just posted
        result = await revive_mod.run(
            torn_client=mock_torn_client_for_bot,
            chat_repo=mock_chat_repo,
            chat_manager=mock_chat_manager,
            war_active=True,
            force=False,
        )
        assert result["posted"] is False
        assert "Throttled" in result["message"]

    @pytest.mark.asyncio
    async def test_posts_during_war_after_interval(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        """War mode posts after 1 hour has passed."""
        revive_mod._last_post_ts = time.time() - 3601  # over 1 hour ago
        with patch("api.bots.revive_monitor._notify_mentions_fn", new_callable=AsyncMock):
            result = await revive_mod.run(
                torn_client=mock_torn_client_for_bot,
                chat_repo=mock_chat_repo,
                chat_manager=mock_chat_manager,
                war_active=True,
                force=False,
            )
        assert result["posted"] is True

    @pytest.mark.asyncio
    async def test_force_bypasses_throttle(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        revive_mod._last_post_ts = time.time()
        with patch("api.bots.revive_monitor._notify_mentions_fn", new_callable=AsyncMock):
            result = await revive_mod.run(
                torn_client=mock_torn_client_for_bot,
                chat_repo=mock_chat_repo,
                chat_manager=mock_chat_manager,
                war_active=False,
                force=True,
            )
        assert result["posted"] is True

    @pytest.mark.asyncio
    async def test_inactive_bot_skips(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        mock_chat_repo.get_bot_by_name.return_value = {
            "id": 1, "name": "Revive Monitor", "active": 0,
        }
        revive_mod._last_post_ts = 0.0
        result = await revive_mod.run(
            torn_client=mock_torn_client_for_bot,
            chat_repo=mock_chat_repo,
            chat_manager=mock_chat_manager,
            war_active=True,
            force=True,
        )
        assert result["posted"] is False
        assert "inactive" in result["message"]

    @pytest.mark.asyncio
    async def test_missing_channel_skips(
        self, mock_torn_client_for_bot, mock_chat_repo, mock_chat_manager,
    ):
        mock_chat_repo.get_channel_by_name.return_value = None
        revive_mod._last_post_ts = 0.0
        result = await revive_mod.run(
            torn_client=mock_torn_client_for_bot,
            chat_repo=mock_chat_repo,
            chat_manager=mock_chat_manager,
            war_active=True,
            force=True,
        )
        assert result["posted"] is False
        assert "Channel not found" in result["message"]
