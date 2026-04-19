import os
import tempfile

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.pinned_weeks import PinnedWeeksRepository


@pytest.fixture
def repo():
    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "test.db")
    migrations_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "api", "db", "migrations"
    )
    run_migrations(db_path, migrations_dir)
    return PinnedWeeksRepository(db_path=db_path)


def test_create_and_list(repo):
    pid = repo.create(
        player_id=2362436, company_id=50000, week_start_ts=1776103200,
        label="Halloween 2025", note="go all out",
    )
    assert pid > 0
    pins = repo.list_for(2362436)
    assert len(pins) == 1
    assert pins[0]["label"] == "Halloween 2025"
    assert pins[0]["note"] == "go all out"


def test_per_player_isolation(repo):
    repo.create(player_id=100, company_id=50000, week_start_ts=1, label="a")
    repo.create(player_id=200, company_id=50000, week_start_ts=1, label="b")
    p100 = repo.list_for(100)
    p200 = repo.list_for(200)
    assert len(p100) == 1
    assert len(p200) == 1
    assert p100[0]["label"] == "a"
    assert p200[0]["label"] == "b"


def test_same_key_upserts_label(repo):
    repo.create(player_id=100, company_id=50000, week_start_ts=1, label="first")
    repo.create(player_id=100, company_id=50000, week_start_ts=1, label="second")
    pins = repo.list_for(100)
    assert len(pins) == 1
    assert pins[0]["label"] == "second"


def test_delete_only_for_owner(repo):
    pid_a = repo.create(player_id=100, company_id=50000, week_start_ts=1, label="a")
    repo.create(player_id=200, company_id=50000, week_start_ts=1, label="b")
    # Player 200 cannot delete player 100's pin
    assert repo.delete(200, pid_a) is False
    assert len(repo.list_for(100)) == 1
    # Player 100 can delete their own
    assert repo.delete(100, pid_a) is True
    assert len(repo.list_for(100)) == 0


def test_filter_by_company(repo):
    repo.create(player_id=100, company_id=500, week_start_ts=1, label="c500")
    repo.create(player_id=100, company_id=600, week_start_ts=1, label="c600")
    pins_500 = repo.list_for(100, company_id=500)
    assert len(pins_500) == 1
    assert pins_500[0]["label"] == "c500"
