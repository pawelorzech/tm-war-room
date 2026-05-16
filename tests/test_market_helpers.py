"""Unit tests for pure helpers in api/routers/market.py.

Currently covers _iso_to_flag (ISO-3166 alpha-2 -> emoji regional-indicator flag).
The function is module-private (underscore prefix) but pure and side-effect free,
so testing it directly is fine — no fixtures or app wiring required.
"""

import pytest

from api.routers.market import _iso_to_flag


def test_iso_to_flag_us():
    # Regional indicator U (U+1F1FA) + S (U+1F1F8)
    assert _iso_to_flag("US") == "\U0001F1FA\U0001F1F8"


def test_iso_to_flag_mx():
    # Regional indicator M (U+1F1F2) + X (U+1F1FD)
    assert _iso_to_flag("MX") == "\U0001F1F2\U0001F1FD"


def test_iso_to_flag_lowercase_input_is_uppercased():
    # Lowercase must produce the same flag — function does .upper() internally.
    assert _iso_to_flag("mx") == _iso_to_flag("MX")


def test_iso_to_flag_gb():
    # Regional indicator G (U+1F1EC) + B (U+1F1E7)
    assert _iso_to_flag("GB") == "\U0001F1EC\U0001F1E7"


def test_iso_to_flag_de_confirms_full_range():
    # Regional indicator D (U+1F1E9) + E (U+1F1EA)
    assert _iso_to_flag("DE") == "\U0001F1E9\U0001F1EA"


@pytest.mark.parametrize("iso", ["US", "MX", "GB", "DE", "JP", "PL", "CA", "AU"])
def test_iso_to_flag_result_is_always_two_codepoints(iso):
    # In Python str, each regional indicator symbol is a single codepoint,
    # so any well-formed 2-letter ISO code must yield len() == 2.
    result = _iso_to_flag(iso)
    assert len(result) == 2


@pytest.mark.parametrize("iso", ["US", "mx", "Gb", "dE"])
def test_iso_to_flag_case_insensitive_length_invariant(iso):
    # Mixed/lowercase inputs preserve the 2-codepoint invariant.
    assert len(_iso_to_flag(iso)) == 2
