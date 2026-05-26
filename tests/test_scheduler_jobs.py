import logging
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from api.db.repos.stats import StatSnapshotRepository
from api.db.repos.keys import KeyRepository
from api.db.migrations.runner import run_migrations
from api.scheduler.jobs.collect_stats import collect_stat_snapshots
from cryptography.fernet import Fernet

@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(path, migrations_dir)
    return path

@pytest.fixture
def key_repo(db_path):
    key = Fernet.generate_key().decode()
    repo = KeyRepository(db_path, key)
    repo.save_key(player_id=123, player_name="Bombel", api_key="test_key_123")
    return repo

@pytest.fixture
def stats_repo(db_path):
    return StatSnapshotRepository(db_path)

@pytest.mark.asyncio
async def test_collect_stat_snapshots(key_repo, stats_repo):
    mock_client = AsyncMock()
    mock_client.fetch_training_data = AsyncMock(return_value={
        "profile": {"name": "Bombel"},
        "battlestats": {"strength": 1e9, "defense": 8e8, "speed": 5e8, "dexterity": 6e8},
        "personalstats": {"xanax_taken": 5000, "refills": 2000, "energy_drinks": 1000, "networth": 5e9},
        "level": 80,
    })
    await collect_stat_snapshots(key_repo, stats_repo, mock_client)
    snaps = stats_repo.get_snapshots(123)
    assert len(snaps) == 1
    assert snaps[0]["strength"] == 1e9
    assert snaps[0]["defense"] == 8e8
    assert snaps[0]["level"] == 80

@pytest.mark.asyncio
async def test_collect_stats_skips_failed_fetch(key_repo, stats_repo):
    mock_client = AsyncMock()
    mock_client.fetch_training_data = AsyncMock(return_value=None)
    await collect_stat_snapshots(key_repo, stats_repo, mock_client)
    snaps = stats_repo.get_snapshots(123)
    assert len(snaps) == 0


@pytest.mark.asyncio
async def test_collect_one_swallows_torn_error_and_continues(db_path, stats_repo, caplog):
    """One player's HTTP error must not block the rest; Sentry captures the
    failure and the summary log carries per-status counts."""
    key = Fernet.generate_key().decode()
    repo = KeyRepository(db_path, key)
    repo.save_key(player_id=111, player_name="Boom", api_key="bad_key")
    repo.save_key(player_id=222, player_name="Healthy", api_key="good_key")

    mock_client = AsyncMock()

    async def fake_fetch(api_key):
        if api_key == "bad_key":
            raise RuntimeError("Torn 504 simulated")
        return {
            "battlestats": {"strength": 1e9, "defense": 1e9, "speed": 1e9, "dexterity": 1e9},
            "personalstats": {"xantaken": 100},
            "level": 50,
        }
    mock_client.fetch_training_data = fake_fetch

    captured = []
    # Sentry capture now flows through the shared `_log_helpers.report_job_error`
    # helper (which demotes httpx 5xx/timeout to warning + skips Sentry, and
    # captures real bugs). RuntimeError is "real bug" path so it still reaches
    # capture_exception with the same tags.
    with patch("api.scheduler.jobs._log_helpers.capture_exception", side_effect=lambda exc, tags=None: captured.append((exc, tags))):
        with caplog.at_level(logging.INFO, logger="tm-hub.jobs.collect_stats"):
            await collect_stat_snapshots(repo, stats_repo, mock_client)

    # Healthy player got persisted; broken one did not.
    assert len(stats_repo.get_snapshots(111)) == 0
    assert len(stats_repo.get_snapshots(222)) == 1
    # Sentry capture fired exactly once, tagged with player_id.
    assert len(captured) == 1
    exc, tags = captured[0]
    assert isinstance(exc, RuntimeError)
    assert tags == {"job": "collect_stats", "player_id": 111}
    # The summary line must surface the breakdown so dashboards can alert on it.
    summary = [r for r in caplog.records if "done — " in r.getMessage()]
    assert summary, "expected summary log line with success/fetch_none/exceptions counts"
    msg = summary[0].getMessage()
    assert "success=1" in msg and "exceptions=1" in msg and "total=2" in msg


@pytest.mark.asyncio
async def test_collect_one_extended_stats_http_error_does_not_block_insert(key_repo, stats_repo):
    """Extended personalstats are best-effort: an HTTP failure there must not
    drop the core snapshot. Pins the swallow inside _fetch_extended_personalstats."""
    mock_client = AsyncMock()
    mock_client.fetch_training_data = AsyncMock(return_value={
        "battlestats": {"strength": 1e9, "defense": 1e9, "speed": 1e9, "dexterity": 1e9},
        "personalstats": {"xantaken": 1},
        "level": 50,
    })
    # Simulate the v1 personalstats endpoint failing — _fetch_extended_personalstats
    # uses ``torn_client._http.get`` directly.
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(side_effect=RuntimeError("ext personalstats blew up"))
    mock_client._http = mock_http

    await collect_stat_snapshots(key_repo, stats_repo, mock_client)

    snaps = stats_repo.get_snapshots(123)
    assert len(snaps) == 1
    # easter_eggs/stat_enhancers fall back to None when ext call fails.
    assert snaps[0]["strength"] == 1e9


class _FakeWar:
    def __init__(self, war_id: int | None):
        self.war_id = war_id


class _FakeSettingsRepo:
    """Minimal settings_repo stub backed by an in-process dict."""
    def __init__(self):
        self._store: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._store.get(key)

    def set(self, key: str, value: str, updated_by=None) -> None:
        self._store[key] = value


def test_war_start_push_fires_once_per_war_id():
    """The 'War Started!' alert must fire exactly once per war_id and survive
    transient wars-endpoint blips + process restart (settings_repo persists)."""
    from api.scheduler.jobs.refresh_data import _check_war_start_push

    settings = _FakeSettingsRepo()
    dispatcher = MagicMock()
    dispatcher.send = MagicMock()

    # Cycle 1 — war 7777 appears, fire once.
    _check_war_start_push(_FakeWar(7777), settings, push_service=None, dispatcher=dispatcher)
    assert dispatcher.send.call_count == 1
    assert settings.get("last_notified_war_id") == "7777"

    # Cycle 2 — same war_id, must be silent.
    _check_war_start_push(_FakeWar(7777), settings, push_service=None, dispatcher=dispatcher)
    assert dispatcher.send.call_count == 1

    # Cycle 3 — wars endpoint blipped empty (war=None), still silent.
    _check_war_start_push(None, settings, push_service=None, dispatcher=dispatcher)
    assert dispatcher.send.call_count == 1

    # Cycle 4 — war 7777 reappears after the blip, still silent (was the bug).
    _check_war_start_push(_FakeWar(7777), settings, push_service=None, dispatcher=dispatcher)
    assert dispatcher.send.call_count == 1

    # Cycle 5 — process restart: dispatcher is fresh, settings persists,
    # same war_id — still silent.
    fresh_dispatcher = MagicMock()
    fresh_dispatcher.send = MagicMock()
    _check_war_start_push(_FakeWar(7777), settings, push_service=None, dispatcher=fresh_dispatcher)
    assert fresh_dispatcher.send.call_count == 0

    # Cycle 6 — a genuinely new war (different war_id) — fire once.
    _check_war_start_push(_FakeWar(8888), settings, push_service=None, dispatcher=fresh_dispatcher)
    assert fresh_dispatcher.send.call_count == 1
    assert settings.get("last_notified_war_id") == "8888"


def test_war_start_push_falls_back_to_push_service_when_no_dispatcher():
    """Older deployments without notification_dispatcher use push_service."""
    from api.scheduler.jobs.refresh_data import _check_war_start_push

    settings = _FakeSettingsRepo()
    push = MagicMock()
    push.dispatch = MagicMock()

    _check_war_start_push(_FakeWar(9999), settings, push_service=push, dispatcher=None)
    push.dispatch.assert_called_once()
    assert push.dispatch.call_args[0][0] == "war_start"
    assert settings.get("last_notified_war_id") == "9999"


def test_loot_level4_triggers_push():
    """When an NPC crosses from level <4 to >=4, push notification is dispatched."""
    from api.scheduler.jobs.refresh_data import _prev_npc_levels, _check_loot_push
    _prev_npc_levels.clear()
    _prev_npc_levels[4] = 3  # Duke was level 3

    mock_push = MagicMock()
    mock_push.dispatch = MagicMock()

    _check_loot_push(
        npcs=[{"id": 4, "name": "Duke", "level": 4}],
        push_service=mock_push,
    )

    mock_push.dispatch.assert_called_once()
    args = mock_push.dispatch.call_args
    assert args[0][0] == "loot_level4"
    assert "Duke" in args[0][1]
