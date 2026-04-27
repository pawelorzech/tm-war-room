"""Tests for the Sentry/Glitchtip PII filter.

Critical: Torn API keys must NEVER be sent to the observability backend, even
if a developer accidentally puts one in a log message, an exception body, or
a query string. These tests pin the scrubber's behaviour so a regression can't
slip past CI.
"""
from __future__ import annotations

import pytest

from api.observability import _before_send, _scrub_value


# A realistic Torn-shaped key (16 alphanumerics) and the redaction marker.
TORN_KEY = "kKDAqxTw00jw9XhJ"
REDACTED = "[Filtered]"


def test_scrubs_torn_key_in_string():
    assert _scrub_value(f"call torn with key={TORN_KEY}") == f"call torn with key={REDACTED}"


def test_scrubs_torn_key_in_url():
    url = f"https://api.torn.com/user/?selections=basic&key={TORN_KEY}"
    out = _scrub_value(url)
    assert TORN_KEY not in out
    assert REDACTED in out


def test_scrubs_value_when_field_name_is_secret_like():
    payload = {"api_key": "any-non-torn-shape-value"}
    out = _scrub_value(payload)
    assert out["api_key"] == REDACTED


def test_scrubs_authorization_header_full_value():
    # Full Bearer JWT must be redacted because the field name is on the secret list.
    payload = {"headers": {"Authorization": "Bearer ey.fake.token.value"}}
    out = _scrub_value(payload)
    assert out["headers"]["Authorization"] == REDACTED


def test_scrubs_cookie_header():
    payload = {"headers": {"Cookie": "tm_session=abcdef; theme=dark"}}
    out = _scrub_value(payload)
    assert out["headers"]["Cookie"] == REDACTED


def test_scrubs_nested_query_params():
    event = {
        "request": {
            "url": "https://hub.tri.ovh/api/x",
            "query_string": f"key={TORN_KEY}&player=123",
        },
    }
    out = _before_send(event, {})
    assert TORN_KEY not in out["request"]["query_string"]


def test_scrubs_inside_list():
    payload = {"breadcrumbs": [{"message": f"got key {TORN_KEY}"}]}
    out = _scrub_value(payload)
    assert TORN_KEY not in out["breadcrumbs"][0]["message"]


def test_does_not_redact_non_secret_strings():
    payload = {"player_name": "Steven", "level": 99}
    out = _scrub_value(payload)
    assert out == {"player_name": "Steven", "level": 99}


def test_short_strings_are_not_falsely_redacted():
    # Less than 16 chars — must not match the Torn key regex.
    payload = {"description": "hello world"}
    out = _scrub_value(payload)
    assert out == {"description": "hello world"}


def test_uuid_shape_does_not_collide():
    # UUIDs have hyphens; the Torn-key pattern requires pure 16-alphanum, so
    # UUIDs survive unchanged.
    uuid_str = "abc12345-def6-7890-abcd-ef1234567890"
    out = _scrub_value(uuid_str)
    assert out == uuid_str


def test_secret_field_names_case_insensitive():
    payload = {"PASSWORD": "hunter2", "Authorization": "Bearer xyz"}
    out = _scrub_value(payload)
    assert out["PASSWORD"] == REDACTED
    assert out["Authorization"] == REDACTED


def test_scrub_failure_drops_event():
    # If scrubbing throws, _before_send must return None (drop the event)
    # rather than leak the original.
    bad = {"_self": None}
    bad["_self"] = bad  # circular reference triggers RecursionError in walk
    out = _before_send(bad, {})
    assert out is None


def test_set_cookie_header_redacted():
    payload = {"headers": {"Set-Cookie": "tm_session=abc; HttpOnly"}}
    out = _scrub_value(payload)
    assert out["headers"]["Set-Cookie"] == REDACTED


def test_torn_key_inside_exception_message():
    event = {
        "exception": {
            "values": [
                {"type": "ValueError", "value": f"bad key {TORN_KEY} for player 999"},
            ],
        },
    }
    out = _before_send(event, {})
    assert TORN_KEY not in out["exception"]["values"][0]["value"]


def test_init_sentry_no_dsn_returns_false(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    from api.observability import init_sentry
    assert init_sentry() is False
