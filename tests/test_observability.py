"""Tests for the Sentry/Glitchtip PII filter.

Critical: Torn API keys must NEVER be sent to the observability backend, even
if a developer accidentally puts one in a log message, an exception body, or
a query string. These tests pin the scrubber's behaviour so a regression can't
slip past CI.
"""
from __future__ import annotations

import httpx
import pytest

from api.observability import _before_send, _is_upstream_noise, _scrub_value


def _http_status_error(
    status_code: int, url: str = "https://api.torn.com/user/"
) -> httpx.HTTPStatusError:
    """Build a real httpx.HTTPStatusError with the given upstream status."""
    request = httpx.Request("GET", url)
    response = httpx.Response(status_code, request=request)
    return httpx.HTTPStatusError(
        f"Server error '{status_code}' for url '{request.url}'",
        request=request,
        response=response,
    )


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


# --- Upstream-noise filter (PYTHON-FASTAPI-D regression) -------------------
#
# Sentry's AsyncioIntegration patches the asyncio task factory and captures
# every exception that escapes a task — independently of whether
# ``asyncio.gather(return_exceptions=True)`` later retrieves it. The scheduler's
# per-job demote logic is therefore bypassed, and Torn API 504s flood Sentry as
# unhandled errors. ``_before_send`` now drops these centrally; these tests
# pin that behaviour.


def test_before_send_drops_504_status_error():
    exc = _http_status_error(504)
    event = {"exception": {"values": [{"type": "HTTPStatusError"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    assert _before_send(event, hint) is None


def test_before_send_drops_500_status_error():
    exc = _http_status_error(500)
    event = {"exception": {"values": [{"type": "HTTPStatusError"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    assert _before_send(event, hint) is None


def test_before_send_drops_timeout_exception():
    exc = httpx.TimeoutException("connect timed out")
    event = {"exception": {"values": [{"type": "TimeoutException"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    assert _before_send(event, hint) is None


def test_before_send_drops_connect_error():
    exc = httpx.ConnectError("name resolution failed")
    event = {"exception": {"values": [{"type": "ConnectError"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    assert _before_send(event, hint) is None


def test_before_send_drops_read_error():
    exc = httpx.ReadError("upstream closed the connection")
    event = {"exception": {"values": [{"type": "ReadError"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    assert _before_send(event, hint) is None


def test_before_send_keeps_4xx_status_error():
    # 4xx may indicate a real bug (bad params, expired key handling) — must
    # NOT be dropped silently.
    exc = _http_status_error(404)
    event = {"exception": {"values": [{"type": "HTTPStatusError"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    out = _before_send(event, hint)
    assert out is not None
    assert out == event


def test_before_send_keeps_legit_value_error():
    exc = ValueError("legit bug")
    event = {"exception": {"values": [{"type": "ValueError", "value": "legit bug"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    out = _before_send(event, hint)
    assert out is not None
    # Scrub still ran — payload preserved unchanged for a non-secret value.
    assert out["exception"]["values"][0]["value"] == "legit bug"


def test_before_send_handles_missing_hint():
    # No hint at all (some integrations call before_send without one) — the
    # filter must not crash and must fall through to scrubbing.
    event = {"message": "hello"}
    out = _before_send(event, None)
    assert out == {"message": "hello"}


def test_is_upstream_noise_predicate():
    assert _is_upstream_noise(_http_status_error(503)) is True
    assert _is_upstream_noise(_http_status_error(599)) is True
    assert _is_upstream_noise(_http_status_error(404)) is False
    assert _is_upstream_noise(httpx.TimeoutException("x")) is True
    assert _is_upstream_noise(httpx.ConnectError("x")) is True
    assert _is_upstream_noise(httpx.ReadError("x")) is True
    assert _is_upstream_noise(ValueError("real bug")) is False


# --- TornStats 4xx noise (PYTHON-FASTAPI-Q regression) ---------------------
#
# TornStats returns 4xx for non-actionable reasons (expired user keys, removed
# endpoints, internal data-shape changes). These flooded Sentry as
# HTTPStatusError 404 from /api/v2/.../loot. We demote 4xx specifically for
# tornstats hosts while keeping 4xx from api.torn.com as real errors.


_TS_URL = "https://www.tornstats.com/api/v2/TS_xxxxxxxxxxxxxxxx/loot"
_TS_URL_NOWWW = "https://tornstats.com/api/v2/TS_xxxxxxxxxxxxxxxx/loot"


def test_is_upstream_noise_tornstats_404():
    assert _is_upstream_noise(_http_status_error(404, _TS_URL)) is True


def test_is_upstream_noise_tornstats_no_www_404():
    assert _is_upstream_noise(_http_status_error(404, _TS_URL_NOWWW)) is True


@pytest.mark.parametrize("status", [400, 401, 403, 418, 422, 429, 451, 499])
def test_is_upstream_noise_tornstats_all_4xx(status):
    assert _is_upstream_noise(_http_status_error(status, _TS_URL)) is True


def test_is_upstream_noise_torn_api_404_still_real_error():
    # 404 from api.torn.com must NOT be demoted — could be a real TM Hub bug
    # (bad selections, wrong key shape, etc.).
    exc = _http_status_error(404, "https://api.torn.com/user/?selections=basic")
    assert _is_upstream_noise(exc) is False


def test_is_upstream_noise_other_host_4xx_unchanged():
    exc = _http_status_error(400, "https://example.com/whatever")
    assert _is_upstream_noise(exc) is False


def test_is_upstream_noise_tornstats_2xx_not_matched():
    # 2xx isn't an error and shouldn't reach the predicate via Sentry, but the
    # check must not match it anyway.
    exc = _http_status_error(200, _TS_URL)
    assert _is_upstream_noise(exc) is False


def test_before_send_drops_tornstats_404():
    exc = _http_status_error(404, _TS_URL)
    event = {"exception": {"values": [{"type": "HTTPStatusError"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    assert _before_send(event, hint) is None


# --- 429 rate-limit demote (PYTHON-FASTAPI-S/T/Q regression) ---------------
#
# Torn API rate-limited us (HTTP 429) on /v2/faction/crimes, /torn?selections=
# honors,medals and /v2/faction?selections=attacks during scheduler refresh
# jobs. 429 is "back off" — never a TM Hub bug — so we demote regardless of
# which upstream throttled us. Non-429 4xx from api.torn.com still page
# Sentry (real-bug signal).


def test_is_upstream_noise_torn_api_429():
    # The triggering case from Sentry issues PYTHON-FASTAPI-S/T/Q: 429 from
    # api.torn.com must be demoted even though it's not a tornstats host.
    exc = _http_status_error(429, "https://api.torn.com/v2/faction/crimes?key=xxx")
    assert _is_upstream_noise(exc) is True


def test_is_upstream_noise_tornstats_429():
    # Regression: tornstats-4xx rule already covers this, but pin it
    # explicitly so both rules stay aligned.
    assert _is_upstream_noise(_http_status_error(429, _TS_URL)) is True


def test_is_upstream_noise_other_host_429():
    # Host-agnostic: 429 from any third party (e.g. Backblaze, httpbin) is
    # still pure rate-limit signal — demote it too.
    exc = _http_status_error(429, "https://httpbin.org/status/429")
    assert _is_upstream_noise(exc) is True


def test_is_upstream_noise_torn_api_400_still_real_error():
    # Regression for commit f39dbc8 (Sentry-suppress on expected 400 at key
    # register lives in the client, NOT here): non-429 4xx from api.torn.com
    # must keep paging Sentry as a real bug signal.
    exc = _http_status_error(400, "https://api.torn.com/v2/faction?selections=attacks")
    assert _is_upstream_noise(exc) is False


def test_is_upstream_noise_5xx_any_host_regression():
    # Sanity that broadening 429 didn't accidentally narrow 5xx coverage.
    assert _is_upstream_noise(_http_status_error(500, "https://api.torn.com/x")) is True
    assert _is_upstream_noise(_http_status_error(502, "https://www.tornstats.com/x")) is True
    assert _is_upstream_noise(_http_status_error(503, "https://example.com/x")) is True


def test_before_send_drops_torn_api_429():
    exc = _http_status_error(429, "https://api.torn.com/v2/faction/crimes?key=xxx")
    event = {"exception": {"values": [{"type": "HTTPStatusError"}]}}
    hint = {"exc_info": (type(exc), exc, None)}
    assert _before_send(event, hint) is None
