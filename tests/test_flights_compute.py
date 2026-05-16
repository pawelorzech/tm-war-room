"""Pure-logic tests for api.flights — no DB, no HTTP, no scheduler."""
from __future__ import annotations

import pytest

from api.flights import (
    FLIGHT_DURATIONS_SECONDS,
    classify_ticket_class,
    detect_transition,
    parse_destination_from_description,
    predict_landing,
)


# ── predict_landing ───────────────────────────────────────────────────────


def test_predict_landing_mexico_standard():
    # Mexico standard = 1560s. Departure at t=1_000_000 → land at t=1_001_560.
    assert predict_landing(1_000_000, "mexico", "standard") == 1_001_560


def test_predict_landing_uk_business():
    assert predict_landing(0, "uk", "business") == 4770


def test_predict_landing_south_africa_wlt():
    assert predict_landing(0, "south_africa", "wlt") == 10692


def test_predict_landing_book_maps_to_business_duration():
    # `book` ticket matches the fastest legitimate option today (business).
    assert predict_landing(0, "japan", "book") == FLIGHT_DURATIONS_SECONDS["japan"]["business"]


def test_predict_landing_unknown_destination_falls_back():
    # Falls back to a small constant rather than crashing the scheduler.
    assert predict_landing(0, "atlantis", "standard") == 1560


def test_predict_landing_destination_alias():
    # "UK" and "United Kingdom" must both resolve.
    assert predict_landing(0, "UK", "standard") == 9540
    assert predict_landing(0, "United Kingdom", "standard") == 9540


def test_predict_landing_unknown_ticket_class_uses_standard():
    # Garbage ticket → fall back to "standard" duration for that destination.
    assert predict_landing(0, "mexico", "first") == 1560


# ── classify_ticket_class ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "destination,duration,expected",
    [
        ("mexico", 1560, "standard"),       # exact standard
        ("mexico", 1580, "standard"),       # +20s drift still standard
        ("mexico", 800, "business"),        # near business (780)
        ("mexico", 936, "wlt"),             # exact wlt
        ("uk", 9540, "standard"),
        ("uk", 4770, "business"),
        ("uk", 5724, "wlt"),
        ("south_africa", 8910, "business"),
        ("south_africa", 17820, "standard"),
    ],
)
def test_classify_ticket_class_matches_canonical_durations(destination, duration, expected):
    assert classify_ticket_class(duration, destination) == expected


def test_classify_ticket_class_below_wlt_emits_book_sentinel():
    # Suspiciously short → "book" sentinel (future-proof; doesn't occur today).
    assert classify_ticket_class(100, "mexico") == "book"


def test_classify_ticket_class_unknown_destination_defaults_standard():
    assert classify_ticket_class(5000, "atlantis") == "standard"


def test_classify_ticket_class_zero_duration_defaults_standard():
    # Pathological — scheduler must never call us with <=0, but guard anyway.
    assert classify_ticket_class(0, "mexico") == "standard"


# ── detect_transition ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "prev,curr,expected",
    [
        ("Okay", "Traveling", "departed"),
        ("Okay", "Abroad", "departed"),        # in case Torn skips the in-air state
        ("Hospital", "Traveling", "departed"), # rare but legal
        ("Traveling", "Okay", "landed"),
        ("Abroad", "Okay", "landed"),
        ("Returning", "Okay", "landed"),
        ("Traveling", "Abroad", "none"),        # mid-flight phase change
        ("Abroad", "Returning", "none"),
        ("Okay", "Okay", "none"),
        ("Hospital", "Okay", "none"),           # not a flight
        ("Traveling", "Hospital", "none"),      # crash/desync: don't pretend it's a landing
    ],
)
def test_detect_transition(prev, curr, expected):
    assert detect_transition(prev, curr) == expected


def test_detect_transition_handles_empty_strings():
    # First-ever observation has no prior; treat as "Okay" baseline.
    assert detect_transition("", "Traveling") == "departed"
    assert detect_transition("Traveling", "") == "landed"
    assert detect_transition("", "") == "none"


# ── parse_destination_from_description ────────────────────────────────────


@pytest.mark.parametrize(
    "description,expected",
    [
        ("Traveling to Mexico", "mexico"),
        ("Traveling to United Kingdom", "united_kingdom"),
        ("In Mexico", "mexico"),
        ("In Cayman Islands", "cayman_islands"),
        ("Returning to Torn from UAE", "uae"),
        ("", ""),
        ("Okay", ""),  # no country present
    ],
)
def test_parse_destination_from_description(description, expected):
    assert parse_destination_from_description(description) == expected
