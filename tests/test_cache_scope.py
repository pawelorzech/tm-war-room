"""Unit tests for TornClient._cache_scope — the isolation prefix.

The scope string is what makes cache keys unique per api_key, so that
fetching members/war/chain with the canonical faction key never returns
data cached under some other player's personal key (or vice versa). The
function is three lines but load-bearing: a regression here can silently
serve one user's data to another.
"""

import pytest

from api.torn_client import TornClient


@pytest.fixture
def client():
    # No network — we never actually hit Torn in these tests; the fixture
    # only needs the api_key state on the client so _cache_scope has
    # something to compare against.
    return TornClient(api_key="FACTION_KEY_AAAA")


def test_cache_scope_returns_default_for_none(client):
    # None means "use the canonical faction key". That collapses to "default"
    # — the bucket every faction-wide endpoint shares.
    assert client._cache_scope(None) == "default"
    # Calling without an argument is the same path.
    assert client._cache_scope() == "default"


def test_cache_scope_returns_default_for_faction_key_passed_explicitly(client):
    # Even if a caller redundantly passes the same key, we should still
    # land in the shared bucket — otherwise we'd cache the same data twice.
    assert client._cache_scope("FACTION_KEY_AAAA") == "default"


def test_cache_scope_isolates_alternate_user_key(client):
    # A different player's key gets its own bucket, prefixed by the first
    # 8 chars (matches the convention used elsewhere in the file).
    assert client._cache_scope("ALICEKEY1234567890") == "ALICEKEY"
    assert client._cache_scope("BOBSKEYY_xxxxxxxx") == "BOBSKEYY"


def test_cache_scope_isolates_alice_from_bob(client):
    # Two distinct user keys must produce two distinct scopes — this is
    # the actual user-isolation guarantee the function exists to make.
    alice = client._cache_scope("ALICEKEY1234567890")
    bob = client._cache_scope("BOBSKEYY9876543210")
    assert alice != bob


def test_cache_scope_handles_short_keys_via_python_slice(client):
    # Python slicing past the length is safe (returns whatever's there).
    # Documenting it so a future "validate min length" addition has to
    # also update this test.
    assert client._cache_scope("short") == "short"
    assert client._cache_scope("a") == "a"


def test_cache_scope_empty_string_falls_back_to_faction_key(client):
    # `api_key or self._api_key` treats "" as falsy and resolves to the
    # faction key → "default" scope. Documents this behavior so a future
    # explicit-None check breaks the test loudly.
    assert client._cache_scope("") == "default"
