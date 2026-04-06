import pytest
from unittest.mock import MagicMock, AsyncMock

from api.models import FactionMember, LastAction, MemberStatus


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
