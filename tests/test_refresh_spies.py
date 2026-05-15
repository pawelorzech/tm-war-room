"""Tests for refresh_spies scheduler job.

Regression coverage for the parser bug discovered 2026-05-15: the previous
implementation called ``fetch_tornstats_spy`` (which returns PersonalStats —
general stats like xanax/attacks_won, no battle stats) and then tried to
read ``strength/defense/speed/dexterity/total`` off those objects via
``getattr(..., 0)``. Every refresh wrote zeros to ``spy_reports``, slowly
overwriting real estimates with placeholders.

These tests pin down the correct contract:

* refresh_spy_cache must use the dedicated battle-stats fetcher.
* It must write the actual stats returned by TornStats into ``spy_reports``.
* It must NOT upsert reports with total == 0 (defense in depth, so a
  partial/empty TornStats response can never poison existing data).
"""
import os
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.db.migrations.runner import run_migrations
from api.db.repos.spies import SpyRepository
from api.models import WarFaction, WarStatus
from api.scheduler.jobs.refresh_spies import refresh_spy_cache
from api.services.spy import SpyService


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(path, migrations_dir)
    return path


@pytest.fixture
def service(db_path):
    return SpyService(SpyRepository(db_path))


def _war_with_enemy(enemy_id: int, our_id: int = 11559) -> WarStatus:
    return WarStatus(
        war_id=1, start=0, end=None, target=500, winner=None,
        factions=[
            WarFaction(id=our_id, name="Us", score=0, chain=0),
            WarFaction(id=enemy_id, name="Them", score=0, chain=0),
        ],
    )


@pytest.mark.asyncio
async def test_refresh_spy_cache_writes_battle_stats(service, monkeypatch):
    """Happy path: real battle stats from TornStats persist into spy_reports.

    Fails on the pre-fix implementation because it called fetch_tornstats_spy
    (PersonalStats) and getattr'd nonexistent strength/defense/... fields → 0.
    """
    monkeypatch.setattr("api.config.FACTION_ID", 11559)

    torn = MagicMock()
    torn.fetch_war = AsyncMock(return_value=_war_with_enemy(37537))
    torn.fetch_tornstats_faction_battle_stats = AsyncMock(return_value={
        45367: {
            "strength": 1_753_800_911, "defense": 1_736_855_006,
            "speed": 1_726_898_445, "dexterity": 1_754_569_575,
            "total": 6_972_123_937, "timestamp": 1778547896,
        },
    })
    torn.fetch_yata_faction_spies = AsyncMock(return_value={})

    await refresh_spy_cache(service, torn, tornstats_key="fake_ts_key")

    reports = service.repo.get_reports(45367)
    assert len(reports) == 1
    r = reports[0]
    assert r["source"] == "tornstats"
    assert r["strength"] == 1_753_800_911
    assert r["defense"] == 1_736_855_006
    assert r["speed"] == 1_726_898_445
    assert r["dexterity"] == 1_754_569_575
    assert r["total"] == 6_972_123_937


@pytest.mark.asyncio
async def test_refresh_spy_cache_skips_zero_total(service, monkeypatch):
    """Defense in depth: a TornStats response with total=0 must NOT overwrite
    existing real data. This is what was happening in prod: TornStats sometimes
    returns empty spy blocks (player hid stats, no data, etc.) and we used to
    blindly write zeros, blowing away the previous good estimate.
    """
    monkeypatch.setattr("api.config.FACTION_ID", 11559)

    # Seed a previous good report
    service.repo.upsert_report(
        player_id=45367, player_name="Achilleus", source="tornstats",
        strength=1.5e9, defense=1.5e9, speed=1.5e9, dexterity=1.5e9, total=6e9,
        confidence="estimate", reported_at="2026-05-10T00:00:00+00:00",
    )
    service.refresh_estimate(45367)

    torn = MagicMock()
    torn.fetch_war = AsyncMock(return_value=_war_with_enemy(37537))
    torn.fetch_tornstats_faction_battle_stats = AsyncMock(return_value={
        45367: {"strength": 0, "defense": 0, "speed": 0, "dexterity": 0, "total": 0, "timestamp": 0},
    })
    torn.fetch_yata_faction_spies = AsyncMock(return_value={})

    await refresh_spy_cache(service, torn, tornstats_key="fake_ts_key")

    est = service.repo.get_estimate(45367)
    assert est is not None
    assert est["total"] == 6e9, "real data must survive a zero-total TornStats response"
    # Only the seed report should exist — the empty TornStats response is skipped
    reports = service.repo.get_reports(45367)
    assert len(reports) == 1


@pytest.mark.asyncio
async def test_refresh_spy_cache_no_war_skips(service, monkeypatch):
    monkeypatch.setattr("api.config.FACTION_ID", 11559)

    torn = MagicMock()
    torn.fetch_war = AsyncMock(return_value=None)
    torn.fetch_tornstats_faction_battle_stats = AsyncMock()
    torn.fetch_yata_faction_spies = AsyncMock()

    await refresh_spy_cache(service, torn, tornstats_key="fake_ts_key")

    torn.fetch_tornstats_faction_battle_stats.assert_not_called()
    torn.fetch_yata_faction_spies.assert_not_called()


@pytest.mark.asyncio
async def test_refresh_spy_cache_yata_only_when_no_ts_key(service, monkeypatch):
    """When TornStats key is missing, the job still fetches YATA. The bot Torn
    API key is always present, so YATA (which authenticates with any registered
    Torn key) remains a viable source.
    """
    monkeypatch.setattr("api.config.FACTION_ID", 11559)

    torn = MagicMock()
    torn.fetch_war = AsyncMock(return_value=_war_with_enemy(37537))
    torn.fetch_tornstats_faction_battle_stats = AsyncMock()
    torn.fetch_yata_faction_spies = AsyncMock(return_value={
        45367: {
            "name": "Achilleus",
            "strength": 2.3e9, "defense": 2.3e9, "speed": 2.3e9, "dexterity": 2.3e9,
            "total": 9.2e9, "timestamp": 1778547896,
        },
    })

    await refresh_spy_cache(service, torn, tornstats_key="")

    torn.fetch_tornstats_faction_battle_stats.assert_not_called()
    reports = service.repo.get_reports(45367)
    assert len(reports) == 1
    assert reports[0]["source"] == "yata"
    assert reports[0]["total"] == 9.2e9


@pytest.mark.asyncio
async def test_refresh_spy_cache_prefers_freshest_across_sources(service, monkeypatch):
    """The point of adding YATA: when TornStats has an old spy and YATA has a
    fresh one (or vice versa), the estimate ends up reflecting whichever is
    most recent — regardless of source. This is the regression that prompted
    the dual-source rewrite (player 348794: 2.67B on TornStats, ~9B on YATA).
    """
    monkeypatch.setattr("api.config.FACTION_ID", 11559)

    # TornStats reports a stale 2.67B (timestamp = 2025-05-15 epoch)
    # YATA reports a fresh 9B (timestamp = 2026-05-14 epoch)
    torn = MagicMock()
    torn.fetch_war = AsyncMock(return_value=_war_with_enemy(37537))
    torn.fetch_tornstats_faction_battle_stats = AsyncMock(return_value={
        348794: {
            "name": "Ziomek",
            "strength": 0.7e9, "defense": 0.6e9, "speed": 0.7e9, "dexterity": 0.67e9,
            "total": 2.67e9, "timestamp": 1747008000,  # 2025-05-12
        },
    })
    torn.fetch_yata_faction_spies = AsyncMock(return_value={
        348794: {
            "name": "Ziomek",
            "strength": 2.25e9, "defense": 2.25e9, "speed": 2.25e9, "dexterity": 2.25e9,
            "total": 9e9, "timestamp": 1778544000,  # 2026-05-15
        },
    })

    await refresh_spy_cache(service, torn, tornstats_key="fake_ts_key")

    # Both reports written
    reports = service.repo.get_reports(348794)
    assert len(reports) == 2
    sources = {r["source"] for r in reports}
    assert sources == {"tornstats", "yata"}
    # Estimate reflects the fresher YATA spy, not the year-old TornStats one
    est = service.repo.get_estimate(348794)
    assert est is not None
    assert est["total"] == 9e9
    assert est["source"] == "yata"
