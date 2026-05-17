"""OC 2.0 digest builder tests (Task #12)."""

from __future__ import annotations

import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from api import chat_oc_digest


@pytest.mark.asyncio
async def test_no_torn_client_returns_inactive():
    card = await chat_oc_digest.build_oc_digest_card(torn_client=None)
    assert card == {"active": False}


@pytest.mark.asyncio
async def test_no_crimes_returns_empty_active_card():
    tc = SimpleNamespace(fetch_faction_crimes=AsyncMock(return_value=[]))
    card = await chat_oc_digest.build_oc_digest_card(torn_client=tc)
    assert card["active"] is True
    assert card["counts"]["ready"] == 0
    assert card["counts"]["waiting"] == 0


@pytest.mark.asyncio
async def test_ready_oc_classified_correctly():
    now = int(time.time())
    tc = SimpleNamespace(fetch_faction_crimes=AsyncMock(return_value=[
        {
            "id": 1, "name": "Bank Job",
            "ready_at": now - 60,
            "slots": [
                {"user": {"id": 10, "name": "A"}, "role": "Driver", "planning_complete": True},
                {"user": {"id": 11, "name": "B"}, "role": "Hacker", "planning_complete": True},
            ],
        }
    ]))
    card = await chat_oc_digest.build_oc_digest_card(torn_client=tc)
    assert card["counts"]["ready"] == 1
    assert card["counts"]["waiting"] == 0
    assert card["ready"][0]["name"] == "Bank Job"


@pytest.mark.asyncio
async def test_waiting_oc_with_empty_tool_slot_lists_tool():
    now = int(time.time())
    tc = SimpleNamespace(fetch_faction_crimes=AsyncMock(return_value=[
        {
            "id": 1, "name": "Bank Job",
            "ready_at": now + 3600,
            "slots": [
                {"user": {"id": 10, "name": "A"}, "role": "Driver", "planning_complete": True},
                {"role": "Drug Pack"},  # empty slot, tool-looking role
            ],
        }
    ]))
    card = await chat_oc_digest.build_oc_digest_card(torn_client=tc)
    assert card["counts"]["ready"] == 0
    assert card["counts"]["waiting"] == 1
    tools = card["blocked_by_tool"]
    assert any(t["tool"] == "Drug Pack" for t in tools)


@pytest.mark.asyncio
async def test_planning_incomplete_blocks_ready():
    now = int(time.time())
    tc = SimpleNamespace(fetch_faction_crimes=AsyncMock(return_value=[
        {
            "id": 1, "name": "Bank Job",
            "ready_at": now - 10,
            "slots": [
                {"user": {"id": 10, "name": "A"}, "role": "Driver", "planning_complete": True},
                {"user": {"id": 11, "name": "B"}, "role": "Hacker", "planning_complete": False},
            ],
        }
    ]))
    card = await chat_oc_digest.build_oc_digest_card(torn_client=tc)
    assert card["counts"]["ready"] == 0
    assert card["counts"]["waiting"] == 1


@pytest.mark.asyncio
async def test_traveling_member_detection():
    now = int(time.time())
    tc = SimpleNamespace(fetch_faction_crimes=AsyncMock(return_value=[
        {
            "id": 1, "name": "Bank Job",
            "ready_at": now - 10,
            "slots": [
                {"user": {"id": 10, "name": "A"}, "role": "Driver", "planning_complete": True},
                {"user": {"id": 11, "name": "B"}, "role": "Hacker", "planning_complete": True},
            ],
        }
    ]))

    async def fake_team():
        return [
            {"id": 10, "name": "A", "status": {"state": "Traveling", "description": "Travel to MEX"}},
            {"id": 11, "name": "B", "status": {"state": "Okay", "description": "Okay"}},
        ]

    card = await chat_oc_digest.build_oc_digest_card(torn_client=tc, fetch_team=fake_team)
    assert card["counts"]["traveling"] == 1
    assert card["traveling_members"][0]["name"] == "A"


@pytest.mark.asyncio
async def test_fetch_crimes_failure_returns_error_card():
    tc = SimpleNamespace(fetch_faction_crimes=AsyncMock(side_effect=Exception("boom")))
    card = await chat_oc_digest.build_oc_digest_card(torn_client=tc)
    assert card["active"] is False
    assert card.get("error") == "oc_fetch_failed"


def test_short_travel_text_compresses_verbose_descriptions():
    fn = chat_oc_digest._short_travel_text
    assert fn("Traveling from Torn to Switzerland") == "→ Switzerland"
    assert fn("Traveling from South Africa to Torn") == "→ Torn"
    assert fn("In Argentina") == "In Argentina"
    assert fn("") == ""
    # Anything else gets truncated at 24 chars.
    long = "Some weird status that runs really long for chips"
    assert len(fn(long)) <= 25  # 24 + ellipsis


@pytest.mark.asyncio
async def test_traveling_status_text_is_short_form():
    now = int(time.time())
    tc = SimpleNamespace(fetch_faction_crimes=AsyncMock(return_value=[
        {
            "id": 1, "name": "Bank Job",
            "ready_at": now - 10,
            "slots": [
                {"user": {"id": 10, "name": "A"}, "role": "Driver", "planning_complete": True},
            ],
        }
    ]))

    async def fake_team():
        return [
            {"id": 10, "name": "A", "status": {"state": "Traveling", "description": "Traveling from Torn to Switzerland"}},
        ]

    card = await chat_oc_digest.build_oc_digest_card(torn_client=tc, fetch_team=fake_team)
    assert card["traveling_members"][0]["status_text"] == "→ Switzerland"
