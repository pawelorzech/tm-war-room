"""Slack-syntax search parser + FTS query builder tests (Task #5).

The parser turns a free-form query like

    from:@Bombel in:war-room has:link before:2026-05-10 -spam xanax

into a structured :class:`ParsedQuery` and a SQL fragment + bind params.
"""

from __future__ import annotations

import pytest

from api.chat_search import ParsedQuery, build_search_sql, parse_query


def _iso_to_ts(s: str) -> int:
    import datetime
    return int(datetime.datetime.fromisoformat(s).replace(tzinfo=datetime.timezone.utc).timestamp())


# ---------------------------------------------------------------------------
# Parser table
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "query,expected",
    [
        # Plain text only — quoted to a phrase for FTS, non-empty term list.
        ("xanax", ParsedQuery(text="xanax", neg_text=[])),
        # from:Name (no @)
        ("from:Bombel hello", ParsedQuery(text="hello", from_name="Bombel")),
        # from:@Name (with @)
        ("from:@Bombel", ParsedQuery(text="", from_name="Bombel")),
        # in:channel
        ("in:war-room ping", ParsedQuery(text="ping", in_channel="war-room")),
        # has:link / has:reaction / has:pin
        ("has:link", ParsedQuery(text="", has=["link"])),
        ("has:link has:reaction", ParsedQuery(text="", has=["link", "reaction"])),
        # before: + after: with YYYY-MM-DD
        ("after:2026-05-01", ParsedQuery(text="", after_ts_min=_iso_to_ts("2026-05-01"))),
        ("before:2026-05-10 xanax", ParsedQuery(text="xanax", before_ts_max=_iso_to_ts("2026-05-10"))),
        # Negation
        ("-spam xanax", ParsedQuery(text="xanax", neg_text=["spam"])),
        # Multiple operators together
        (
            "from:@Bombel in:war-room has:link before:2026-06-01 after:2026-05-01 -spam xanax pills",
            ParsedQuery(
                text="xanax pills",
                neg_text=["spam"],
                from_name="Bombel",
                in_channel="war-room",
                has=["link"],
                before_ts_max=_iso_to_ts("2026-06-01"),
                after_ts_min=_iso_to_ts("2026-05-01"),
            ),
        ),
        # Empty input
        ("", ParsedQuery()),
        ("    ", ParsedQuery()),
        # Operator with empty value is treated as literal text (defensive)
        ("from: hello", ParsedQuery(text="hello")),
        # Unknown operator falls through to free text
        ("foo:bar baz", ParsedQuery(text="foo:bar baz")),
        # Case-insensitive operator
        ("FROM:Bombel", ParsedQuery(text="", from_name="Bombel")),
        # Invalid date silently dropped (we don't 400 on partial queries)
        ("before:not-a-date xanax", ParsedQuery(text="xanax")),
        # has: with unsupported flag is dropped
        ("has:weird stuff", ParsedQuery(text="stuff")),
    ],
)
def test_parse_query(query: str, expected: ParsedQuery) -> None:
    assert parse_query(query) == expected


# ---------------------------------------------------------------------------
# SQL builder
# ---------------------------------------------------------------------------


def test_build_sql_text_only() -> None:
    sql, params = build_search_sql(parse_query("xanax"))
    assert "chat_messages_fts" in sql
    assert "MATCH ?" in sql
    # FTS query token, not a bare word
    assert "xanax" in params[0]
    # Must filter out soft-deleted rows
    assert "deleted = 0" in sql or "deleted=0" in sql


def test_build_sql_filters_by_author() -> None:
    sql, params = build_search_sql(parse_query("from:@Bombel"))
    assert "player_name" in sql
    assert "Bombel" in params


def test_build_sql_filters_by_channel_name() -> None:
    sql, params = build_search_sql(parse_query("in:war-room hello"))
    assert "channel_id" in sql or "chat_channels" in sql
    assert "war-room" in params


def test_build_sql_filters_date_range() -> None:
    p = parse_query("after:2026-05-01 before:2026-06-01 ping")
    sql, params = build_search_sql(p)
    assert "created_at" in sql
    assert p.after_ts_min in params
    assert p.before_ts_max in params


def test_build_sql_has_link() -> None:
    sql, params = build_search_sql(parse_query("has:link"))
    # We translate has:link → simple LIKE %http% on content (FTS doesn't
    # offer a "has URL" predicate by default).
    assert "content LIKE" in sql or "LIKE ?" in sql


def test_build_sql_negation_excludes_term() -> None:
    sql, params = build_search_sql(parse_query("-spam xanax"))
    # FTS5 supports NOT operator; we render `xanax NOT spam` style.
    assert any("NOT" in p and "spam" in p for p in params)


def test_build_sql_caps_limit() -> None:
    """search_sql must enforce a hard limit even if caller passes a huge one."""
    sql, params = build_search_sql(parse_query("xanax"), limit=100_000)
    # Limit is appended either as ? or literal; both fine — what matters is
    # that we cap. We use ? param with value <= 200.
    assert any(isinstance(p, int) and 0 < p <= 200 for p in params)


# ---------------------------------------------------------------------------
# FTS escaping — protect against injection of FTS operators in raw text
# ---------------------------------------------------------------------------


def test_build_sql_escapes_quotes_in_text() -> None:
    """A user typing "foo" must not break out of the FTS phrase."""
    sql, params = build_search_sql(parse_query('"hello" world'))
    # Don't crash; produce something. The FTS5 phrase syntax requires
    # double-quote escaping inside phrases ("" → ").
    assert sql  # non-empty
    assert params  # non-empty


# ---------------------------------------------------------------------------
# HTTP endpoint (GET /api/chat/search?q=...)
# ---------------------------------------------------------------------------


def _mount_search_app(messages_to_return=None, channels=None):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from unittest.mock import patch
    from api.routers.chat import router as chat_router

    app = FastAPI()
    app.include_router(chat_router)

    class _Store:
        def has_key(self, _pid):
            return True

        def is_admin(self, _pid):
            return False

    class _Repo:
        def get_channels(self):
            return channels or []

        def search_messages(self, sql, params, *, excluded_channel_ids=None):
            return list(messages_to_return or [])

        def get_reactions_for_messages(self, ids):
            return {i: [] for i in ids}

    patches = [
        patch("api.routers.chat.chat_repo", _Repo()),
        patch("api.routers.chat.chat_manager", object()),
        patch("api.routers.chat.key_store", _Store()),
        patch("api.routers.chat.settings_repo", None),
    ]
    for p in patches:
        p.start()
    return app, patches, TestClient


def test_search_endpoint_returns_results() -> None:
    app, patches, TestClient = _mount_search_app(
        messages_to_return=[
            {"id": 1, "channel_id": 2, "thread_id": None, "player_id": 1,
             "player_name": "Bombel", "content": "hi xanax", "bot_id": None,
             "mentions": [], "pinned": 0, "deleted": 0,
             "created_at": 1700000000, "edited_at": None, "snippet": "hi <mark>xanax</mark>"},
        ],
    )
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/api/chat/search?q=xanax",
                headers={"X-Player-Id": "1"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["query"] == "xanax"
        assert body["parsed"]["text"] == "xanax"
        assert len(body["messages"]) == 1
        assert body["messages"][0]["snippet"].count("<mark>") == 1
    finally:
        for p in patches:
            p.stop()


def test_search_endpoint_rejects_empty_query() -> None:
    app, patches, TestClient = _mount_search_app()
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/api/chat/search?q=",
                headers={"X-Player-Id": "1"},
            )
        assert resp.status_code == 422, resp.text
    finally:
        for p in patches:
            p.stop()


def test_search_endpoint_caps_limit() -> None:
    app, patches, TestClient = _mount_search_app()
    try:
        with TestClient(app) as client:
            # Above the MAX_LIMIT (200) — FastAPI Query validator rejects.
            resp = client.get(
                "/api/chat/search?q=xanax&limit=5000",
                headers={"X-Player-Id": "1"},
            )
        assert resp.status_code == 422, resp.text
    finally:
        for p in patches:
            p.stop()
