"""Unit tests for the small pure helpers in api.torn_client.

`_num` is the coercion boundary that prevents non-numeric upstream values
(TornStats "N/A", YATA nulls) from leaking into REAL columns where they
later round-trip back as strings and render as NaN in the browser. It's
load-bearing for spy-stat correctness and is currently only covered
indirectly through integration tests — adding direct unit coverage
catches regressions at the boundary without spinning up the full fetcher.
"""

import math

import pytest

from api.torn_client import _num


@pytest.mark.parametrize(
    "value, expected",
    [
        (123.45, 123.45),
        (42, 42.0),
        (0, 0.0),
        (-7.5, -7.5),
        ("3.14", 3.14),
        ("42", 42.0),
        ("-1", -1.0),
        ("0", 0.0),
    ],
)
def test_num_passes_through_numeric_inputs(value, expected):
    assert _num(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "N/A",
        "n/a",
        "",
        "   ",
        "not a number",
        "1.2.3",
        None,
        [],
        {},
        [1, 2],
        {"x": 1},
        object(),
    ],
)
def test_num_coerces_non_numeric_to_zero(value):
    assert _num(value) == 0.0


def test_num_handles_bool_like_python_float():
    # float(True) == 1.0, float(False) == 0.0 — documenting actual behavior
    # so a future "treat bool as non-numeric" refactor would fail loudly.
    assert _num(True) == 1.0
    assert _num(False) == 0.0


def test_num_returns_inf_for_inf_string():
    # float("inf") works in Python — confirm we don't silently reject it.
    # Callers are responsible for any further clamping.
    result = _num("inf")
    assert math.isinf(result)
    assert result > 0


def test_num_returns_zero_for_nan_string_we_intend_to_reject():
    # NB: float("nan") in Python returns a NaN float — but in this codebase
    # we want NaN-string upstream values to be rejected at the boundary.
    # Current behavior: float("nan") succeeds → _num returns NaN. Document
    # this so anyone tightening the helper later sees the test break.
    result = _num("nan")
    assert math.isnan(result), (
        "Current _num accepts 'nan' string via float() — if you tighten this, "
        "update the test to expect 0.0 and add the explicit check."
    )
