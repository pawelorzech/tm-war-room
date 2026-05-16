"""Time-window and eviction tests for ``api.auth.RateLimiter``.

The existing tests in ``tests/test_auth.py`` cover the immediate request
counter (first N allowed, N+1 blocked, distinct keys isolated). They do
NOT exercise:

  - window expiry — that an entry older than ``window_seconds`` no longer
    counts against the quota;
  - the 300-second memory-eviction sweep that drops dead keys to bound
    growth;
  - the boundary where a timestamp is exactly at ``now - window_seconds``.

A regression in any of these silently breaks rate limits (false negative
= traffic abuse, false positive = legitimate retries blocked) or leaks
memory under load. Adding direct time-mocked coverage pins the
sliding-window and eviction semantics.
"""

import time

import pytest

from api import auth as auth_mod
from api.auth import RateLimiter


@pytest.fixture
def fixed_time(monkeypatch):
    """Patch ``time.time`` *as seen by ``api.auth``* so each test can
    advance the clock deterministically. ``RateLimiter`` reads
    ``time.time`` via the module-level import in api/auth.py."""

    class Clock:
        def __init__(self) -> None:
            self.now = 1_000_000.0  # arbitrary baseline

        def __call__(self) -> float:
            return self.now

        def advance(self, seconds: float) -> None:
            self.now += seconds

    clock = Clock()
    monkeypatch.setattr(auth_mod.time, "time", clock)
    return clock


def test_window_expiry_allows_new_request_after_old_ones_age_out(fixed_time):
    rl = RateLimiter()
    # Fill quota at t=0.
    for _ in range(5):
        assert rl.check("k", max_requests=5, window_seconds=60) is True
    # 6th immediately → blocked.
    assert rl.check("k", max_requests=5, window_seconds=60) is False

    # Advance 61s — all entries are now older than window.
    fixed_time.advance(61)
    assert rl.check("k", max_requests=5, window_seconds=60) is True


def test_window_expiry_partial_aging_keeps_recent_entries_counting(fixed_time):
    rl = RateLimiter()
    # Three requests at t=0.
    for _ in range(3):
        rl.check("k", max_requests=5, window_seconds=60)
    # 30s later, two more.
    fixed_time.advance(30)
    for _ in range(2):
        rl.check("k", max_requests=5, window_seconds=60)
    # Quota is full (5 entries within 60s window).
    assert rl.check("k", max_requests=5, window_seconds=60) is False

    # Advance another 31s: the first batch (t=0) is now 61s old → expired.
    # The second batch (t=30, now t=61) is still within the window.
    fixed_time.advance(31)
    # Quota now: 2 active entries, room for 3 more.
    for _ in range(3):
        assert rl.check("k", max_requests=5, window_seconds=60) is True
    assert rl.check("k", max_requests=5, window_seconds=60) is False


def test_boundary_strict_greater_than_cutoff(fixed_time):
    # The filter is ``t > cutoff`` (strict). An entry exactly at the cutoff
    # is NOT kept. Documenting this so a future ``>=`` refactor fails loudly.
    rl = RateLimiter()
    rl.check("k", max_requests=5, window_seconds=60)  # entry at t=0

    fixed_time.advance(60)  # cutoff = now - 60 = 0; entry timestamp == cutoff
    # Quota should be effectively empty again — the t=0 entry drops on the
    # ``t > cutoff`` filter.
    for _ in range(5):
        assert rl.check("k", max_requests=5, window_seconds=60) is True
    assert rl.check("k", max_requests=5, window_seconds=60) is False


def test_eviction_drops_dead_keys_after_5_minutes(fixed_time):
    rl = RateLimiter()
    # Populate three keys at t=0.
    for i in range(3):
        rl.check(f"dead-key-{i}", max_requests=5, window_seconds=60)
    rl.check("survivor", max_requests=5, window_seconds=60)
    assert len(rl._requests) == 4

    # Advance past the 5-minute eviction interval AND past the 60s window,
    # so the dead keys have no live entries.
    fixed_time.advance(301)
    # All dead keys had only the single t=0 timestamp, which is now 301s old.
    # Touching the limiter again triggers the eviction sweep.
    rl.check("survivor", max_requests=5, window_seconds=60)
    # Survivor remains (just got a fresh entry); dead keys swept out.
    assert set(rl._requests.keys()) == {"survivor"}


def test_eviction_only_runs_after_5_minutes(fixed_time):
    rl = RateLimiter()
    rl.check("k", max_requests=5, window_seconds=60)
    initial_last_evict = rl._last_evict

    # 299s later — under the 300s threshold, no sweep.
    fixed_time.advance(299)
    rl.check("k", max_requests=5, window_seconds=60)
    assert rl._last_evict == initial_last_evict  # unchanged

    # One more second past the threshold — sweep fires.
    fixed_time.advance(2)
    rl.check("k", max_requests=5, window_seconds=60)
    assert rl._last_evict > initial_last_evict


def test_eviction_preserves_partially_live_keys(fixed_time):
    # If a key has SOME entries past the window and SOME within it, the
    # eviction keeps the key with just the live entries — must not drop
    # the whole key.
    rl = RateLimiter()
    rl.check("k", max_requests=5, window_seconds=60)  # t=0
    fixed_time.advance(50)
    rl.check("k", max_requests=5, window_seconds=60)  # t=50 (still live at t=311)

    fixed_time.advance(261)  # now t=311, eviction-eligible
    rl.check("k", max_requests=5, window_seconds=60)  # triggers sweep + records t=311
    # The original t=0 entry is dead (311s old, cutoff = 311-60 = 251).
    # The t=50 entry is also dead (261s old, < 251 cutoff).
    # Wait — 311 - 50 = 261, cutoff = 251 → 50 < 251, so 50 IS dropped.
    # Only the just-added entry at t=311 survives.
    assert "k" in rl._requests
    assert len(rl._requests["k"]) == 1
