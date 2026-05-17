"""Chain-assist repo + command tests (Task #10)."""

from __future__ import annotations

import sqlite3
import tempfile

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.chain_assists import ChainAssistRepository


@pytest.fixture
def db_path():
    p = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    run_migrations(p, "api/db/migrations")
    yield p


@pytest.fixture
def repo(db_path):
    return ChainAssistRepository(db_path)


def _make_assist(repo, channel_id=1, target_id=999, target_name="Foe",
                 status="Okay", started_by=1, name="Bombel"):
    return repo.create(
        channel_id=channel_id, target_id=target_id, target_name=target_name,
        target_status_state=status,
        started_by=started_by, started_by_name=name,
    )


def test_create_and_get(repo):
    aid = _make_assist(repo)
    a = repo.get(aid)
    assert a is not None
    assert a["target_id"] == 999
    assert a["hitters"] == []
    assert a["ended_at"] is None


def test_add_hitter_is_idempotent(repo):
    aid = _make_assist(repo)
    repo.add_hitter(aid, 1, "Bombel")
    repo.add_hitter(aid, 1, "Bombel")  # dup
    repo.add_hitter(aid, 2, "Other")
    a = repo.get(aid)
    assert len(a["hitters"]) == 2
    assert {h["id"] for h in a["hitters"]} == {1, 2}


def test_add_hitter_on_ended_returns_none(repo):
    aid = _make_assist(repo)
    repo.end(aid)
    out = repo.add_hitter(aid, 1, "Bombel")
    assert out is None


def test_get_active_for_channel_returns_newest_only(repo):
    a1 = _make_assist(repo, target_id=1)
    a2 = _make_assist(repo, target_id=2)
    cur = repo.get_active_for_channel(1)
    assert cur is not None
    # newest first ordering
    assert cur["id"] == a2
    repo.end(a2)
    cur2 = repo.get_active_for_channel(1)
    assert cur2 is not None
    assert cur2["id"] == a1
    repo.end(a1)
    assert repo.get_active_for_channel(1) is None


def test_update_target_status_returns_previous(repo):
    aid = _make_assist(repo, status="Hospital")
    prev = repo.update_target_status(aid, "Okay")
    assert prev == "Hospital"
    same = repo.update_target_status(aid, "Okay")
    assert same == "Okay"  # no change, returns current
    a = repo.get(aid)
    assert a["target_status_state"] == "Okay"


def test_update_target_status_on_ended_returns_none(repo):
    aid = _make_assist(repo)
    repo.end(aid)
    assert repo.update_target_status(aid, "Hospital") is None


# ---------------------------------------------------------------------------
# Slash-command parsing — pure-Python, no DB
# ---------------------------------------------------------------------------


def test_chain_args_parse_target_id():
    from api.chat_chain import parse_chain_args

    assert parse_chain_args("target 12345") == ("target", 12345)
    assert parse_chain_args("target [12345]") == ("target", 12345)
    assert parse_chain_args("target https://www.torn.com/profiles.php?XID=12345") == ("target", 12345)


def test_chain_args_parse_end():
    from api.chat_chain import parse_chain_args
    assert parse_chain_args("end") == ("end", None)


def test_chain_args_parse_invalid():
    from api.chat_chain import parse_chain_args
    assert parse_chain_args("") is None
    assert parse_chain_args("target") is None  # missing id
    assert parse_chain_args("target abc") is None
    assert parse_chain_args("foo 1") is None  # unknown subcommand
