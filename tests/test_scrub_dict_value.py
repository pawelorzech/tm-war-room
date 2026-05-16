"""Unit tests for `api.observability._scrub_dict_value`.

This is the gate the PII scrubber uses to decide whether to redact a whole
nested value (because its parent key looks like a secret name) or to
recurse into it normally. It runs on every breadcrumb, request, and
captured exception that leaves the process for Sentry. A regression here
either leaks API keys/passwords (false negative) or destroys legitimate
diagnostic context (false positive). Currently covered only via the
indirect `_scrub_value` recursion — direct tests pin the branching
behavior so it can't drift quietly.
"""

import pytest

from api.observability import _REDACTED, _scrub_dict_value


@pytest.mark.parametrize(
    "secret_key",
    [
        "key",
        "api_key",
        "apikey",
        "token",
        "password",
        "secret",
        "authorization",
        "cookie",
        "set-cookie",
        "x-mcp-token",
        "tornstats_api_key",
        "encryption_key",
        "jwt_secret",
        "backup_encryption_key",
    ],
)
def test_secret_named_key_redacts_value(secret_key):
    # Whatever the value looks like — string, number, even a nested dict —
    # a secret-named key means "do not let it out". Pattern is value-blind:
    # the key tells us to redact.
    assert _scrub_dict_value(secret_key, "AAAAAAAAAAAAAAAA") == _REDACTED
    assert _scrub_dict_value(secret_key, 12345) == _REDACTED
    assert _scrub_dict_value(secret_key, {"nested": "still gone"}) == _REDACTED


def test_secret_key_match_is_case_insensitive():
    # Real-world request keys can come capitalized ("Authorization") or
    # screaming ("PASSWORD"). The lookup is case-insensitive — confirm.
    assert _scrub_dict_value("Authorization", "Bearer secret") == _REDACTED
    assert _scrub_dict_value("PASSWORD", "hunter2") == _REDACTED
    assert _scrub_dict_value("API_KEY", "abc") == _REDACTED
    assert _scrub_dict_value("Set-Cookie", "sid=abc") == _REDACTED


def test_non_secret_key_recurses_into_value():
    # A field name we don't recognize as a secret falls through to
    # _scrub_value, which only scrubs Torn-key-shaped substrings.
    # "player_name" carrying a non-key string passes through unchanged.
    assert _scrub_dict_value("player_name", "Bombel") == "Bombel"
    assert _scrub_dict_value("level", 42) == 42


def test_non_secret_key_with_nested_dict_recurses():
    # The recursive path: a non-secret key holding a dict should walk
    # the inner dict, where any inner secret-named field gets redacted.
    payload = {"public": "ok", "password": "hunter2"}
    out = _scrub_dict_value("profile", payload)
    assert out == {"public": "ok", "password": _REDACTED}


def test_torn_api_key_shaped_value_redacted_inside_non_secret_field():
    # 16-char alphanumeric values match the Torn key regex. Even when the
    # field name is innocuous, the underlying _scrub_value should still
    # replace the substring with [Filtered]. Demonstrates the layered
    # defense: dict-level redaction OR value-level regex.
    body = "user posted aBcDeFgH12345678 in chat"
    out = _scrub_dict_value("message_body", body)
    assert _REDACTED in out
    assert "aBcDeFgH12345678" not in out


def test_non_string_key_falls_through_to_value_scrub():
    # Sentry events sometimes have integer/object keys (e.g. tuple-keyed
    # mappings synthesized from breadcrumbs). The function must not crash
    # on those — it should just defer to _scrub_value on the value.
    assert _scrub_dict_value(42, "harmless") == "harmless"
    assert _scrub_dict_value(None, "also fine") == "also fine"


def test_unknown_key_with_list_of_secret_dicts_recurses():
    # Lists of dicts are a common Sentry payload shape (breadcrumbs).
    # Each inner dict should have its own secret-named fields redacted.
    items = [
        {"name": "Alice", "api_key": "deadbeefdeadbeef"},
        {"name": "Bob", "password": "x"},
    ]
    out = _scrub_dict_value("members", items)
    assert out == [
        {"name": "Alice", "api_key": _REDACTED},
        {"name": "Bob", "password": _REDACTED},
    ]
