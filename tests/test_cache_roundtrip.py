"""Unit tests for TornClient._get_cached / _set_cached round-trip.

These two helpers underpin every cached fetch in the codebase (members,
war, chain, training, bounties, item prices, etc.). They're three to
five lines each but combine: TTL math with a per-call override, missing-
key handling, and a tuple-shaped storage. A regression here silently
poisons every cached endpoint at once, so direct coverage is worth more
than the one indirect assertion (`_get_cached("yata_down", ttl=60) is None`)
in tests/test_torn_client.py.
"""

import time

import pytest

from api.torn_client import TornClient


@pytest.fixture
def client():
    # cache_ttl=60 matches the project default in api/main.py.
    return TornClient(api_key="FACTION_KEY_AAAA", cache_ttl=60)


def test_set_then_get_returns_stored_value(client):
    client._set_cached("k1", {"hello": "world"})
    assert client._get_cached("k1") == {"hello": "world"}


def test_get_missing_key_returns_none(client):
    assert client._get_cached("never-set") is None


def test_set_overwrites_previous_value(client):
    client._set_cached("k", "first")
    client._set_cached("k", "second")
    assert client._get_cached("k") == "second"


def test_get_respects_default_ttl(client, monkeypatch):
    # Default TTL is 60s. Freeze "now" to a baseline, set, then advance
    # past the TTL — value must disappear from the view of _get_cached.
    base = 1_000_000.0
    monkeypatch.setattr(time, "time", lambda: base)
    client._set_cached("k", "data")

    # 30s later: still cached.
    monkeypatch.setattr(time, "time", lambda: base + 30)
    assert client._get_cached("k") == "data"

    # 61s later: expired.
    monkeypatch.setattr(time, "time", lambda: base + 61)
    assert client._get_cached("k") is None


def test_get_with_explicit_ttl_overrides_default(client, monkeypatch):
    # Custom TTL on retrieval is the YATA-vs-default-TTL pattern: stored
    # with the client's default TTL, but a caller can ask "is this fresh
    # under a stricter or looser window?" without touching the storage.
    base = 1_000_000.0
    monkeypatch.setattr(time, "time", lambda: base)
    client._set_cached("k", "data")

    # 5s later, asking with ttl=10 → still fresh.
    monkeypatch.setattr(time, "time", lambda: base + 5)
    assert client._get_cached("k", ttl=10) == "data"

    # Same 5s later, asking with ttl=3 → already stale.
    assert client._get_cached("k", ttl=3) is None

    # 200s later with ttl=3600 → still fresh (long TTL extends visibility).
    monkeypatch.setattr(time, "time", lambda: base + 200)
    assert client._get_cached("k", ttl=3600) == "data"


def test_get_with_explicit_ttl_does_not_mutate_storage(client, monkeypatch):
    # A get with a custom TTL that says "stale" must NOT delete the entry —
    # the value should reappear if a later get with a longer TTL asks.
    base = 1_000_000.0
    monkeypatch.setattr(time, "time", lambda: base)
    client._set_cached("k", "data")
    monkeypatch.setattr(time, "time", lambda: base + 100)
    assert client._get_cached("k", ttl=10) is None     # appears stale
    assert client._get_cached("k", ttl=3600) == "data"  # but still there


def test_keys_are_isolated(client):
    client._set_cached("user_a:training", "alice-stats")
    client._set_cached("user_b:training", "bob-stats")
    assert client._get_cached("user_a:training") == "alice-stats"
    assert client._get_cached("user_b:training") == "bob-stats"


def test_can_store_none_distinct_from_missing(client):
    # _set_cached(k, None) currently stores None at k; a subsequent _get_cached
    # returns None (which collides with "key missing" semantically). Documenting
    # the current behavior so a future "missing != stored-None" semantics
    # change has to update the test.
    client._set_cached("k", None)
    assert client._get_cached("k") is None
    # The underlying storage *does* have the key, even though the public
    # surface can't distinguish:
    assert "k" in client._cache
