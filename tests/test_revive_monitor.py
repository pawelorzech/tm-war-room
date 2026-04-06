import pytest
from unittest.mock import MagicMock, AsyncMock

from api.models import FactionMember, LastAction, MemberStatus
from api.bots.revive_monitor import run, _filter_revive_enabled, _format_message


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
        assert "UWAGA" in msg
        assert "@Risky" in msg

    def test_peace_mode_gentle(self):
        members = [_make_member(id=1, name="Risky", revive_setting="Everyone")]
        msg = _format_message(members, war_active=False)
        assert "Przypomnienie" in msg
        assert "@Risky" in msg

    def test_empty_list_all_clear(self):
        msg = _format_message([], war_active=False)
        assert "Wszystko OK" in msg

    def test_empty_list_war_all_clear(self):
        msg = _format_message([], war_active=True)
        assert "Wszystko OK" in msg

    def test_shows_revive_setting(self):
        members = [_make_member(id=1, name="P1", revive_setting="Friends & faction")]
        msg = _format_message(members, war_active=True)
        assert "Friends & faction" in msg

    def test_multiple_members(self):
        members = [
            _make_member(id=1, name="P1", revive_setting="Everyone"),
            _make_member(id=2, name="P2", revive_setting="Friends & faction"),
        ]
        msg = _format_message(members, war_active=False)
        assert "@P1" in msg
        assert "@P2" in msg
