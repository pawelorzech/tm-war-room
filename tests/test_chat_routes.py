"""HTTP-level tests for api/routers/chat.py route validation.

These tests mount the chat router standalone and exercise FastAPI's
parameter validation layer — they intentionally do not depend on a
real chat_repo / chat_manager / key_store, because FastAPI rejects
invalid query params with 422 BEFORE any route handler (and its
dependency mocks) runs.
"""
from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _app() -> FastAPI:
    from api.routers.chat import router as chat_router
    app = FastAPI()
    app.include_router(chat_router)
    return app


class _StubChatRepo:
    """Minimal in-memory stub good enough for get_messages roundtrip."""

    def __init__(self, messages, reactions=None):
        self._messages = list(messages)
        self._reactions = reactions or {}

    def get_channel(self, channel_id):
        return {"id": channel_id, "name": "test", "admin_only": 0}

    def get_messages(self, channel_id, before_id=None, after_id=None, limit=50):
        return [dict(m) for m in self._messages]

    def get_reactions_for_messages(self, message_ids):
        return {mid: self._reactions.get(mid, []) for mid in message_ids}


class _StubKeyStore:
    def has_key(self, _player_id):
        return True

    def is_admin(self, _player_id):
        return False


def _make_app_with_messages(messages):
    """Mount the chat router with stubs that let get_messages run end-to-end."""
    from api.routers.chat import router as chat_router

    app = FastAPI()
    app.include_router(chat_router)
    repo = _StubChatRepo(messages)
    store = _StubKeyStore()

    # chat_manager needs to be truthy so _not_ready() passes; the get_messages
    # route never actually broadcasts, so a sentinel object is fine.
    patches = [
        patch("api.routers.chat.chat_repo", repo),
        patch("api.routers.chat.chat_manager", object()),
        patch("api.routers.chat.key_store", store),
        patch("api.routers.chat.settings_repo", None),
    ]
    for p in patches:
        p.start()
    return app, patches


def test_get_messages_rejects_negative_limit():
    """limit=-1 must be rejected by FastAPI validation (422), not silently
    become 'no limit' in SQLite (which would dump the entire channel)."""
    app = _app()
    with TestClient(app) as client:
        resp = client.get(
            "/api/chat/channels/1/messages?limit=-1",
            headers={"X-Player-Id": "123"},
        )
    assert resp.status_code == 422, (
        f"Expected 422 for limit=-1, got {resp.status_code}: {resp.text[:200]}"
    )


def test_get_messages_rejects_zero_limit():
    """limit=0 is meaningless (asks for zero messages) and must be rejected."""
    app = _app()
    with TestClient(app) as client:
        resp = client.get(
            "/api/chat/channels/1/messages?limit=0",
            headers={"X-Player-Id": "123"},
        )
    assert resp.status_code == 422, (
        f"Expected 422 for limit=0, got {resp.status_code}: {resp.text[:200]}"
    )


def test_get_messages_rejects_oversized_limit():
    """limit=200 exceeds the 100-message cap and must be rejected."""
    app = _app()
    with TestClient(app) as client:
        resp = client.get(
            "/api/chat/channels/1/messages?limit=200",
            headers={"X-Player-Id": "123"},
        )
    assert resp.status_code == 422, (
        f"Expected 422 for limit=200, got {resp.status_code}: {resp.text[:200]}"
    )


# ── ?include=entities (Task #1 — entity-card resolver) ────────────────────────


def test_get_messages_omits_entities_by_default():
    """Back-compat: a vanilla GET must NOT include the entities field."""
    messages = [
        {"id": 1, "content": "hit torn.com/profiles.php?XID=2362436 plox", "mentions": []},
    ]
    app, patches = _make_app_with_messages(messages)
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/api/chat/channels/1/messages",
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["messages"][0].get("entities") is None
        assert "entities" not in body["messages"][0]
    finally:
        for p in patches:
            p.stop()


def test_get_messages_attaches_entities_when_requested():
    """?include=entities adds a typed entity list to each message."""
    messages = [
        {
            "id": 1,
            "content": "ping torn.com/profiles.php?XID=2362436 and grab a [Xanax]",
            "mentions": [],
        },
        {"id": 2, "content": "plain text, nothing to detect", "mentions": []},
    ]
    app, patches = _make_app_with_messages(messages)
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/api/chat/channels/1/messages?include=entities",
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        first_entities = body["messages"][0]["entities"]
        kinds = [e["kind"] for e in first_entities]
        ids = [e["id"] for e in first_entities]
        assert kinds == ["player", "item"]
        assert ids == [2362436, None]
        # Second message has no entities
        assert body["messages"][1]["entities"] == []
    finally:
        for p in patches:
            p.stop()


def test_get_messages_include_unknown_value_is_ignored():
    """?include=foo should not crash or attach unexpected fields."""
    messages = [{"id": 1, "content": "torn.com/profiles.php?XID=1", "mentions": []}]
    app, patches = _make_app_with_messages(messages)
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/api/chat/channels/1/messages?include=banana",
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "entities" not in body["messages"][0]
    finally:
        for p in patches:
            p.stop()


# ── Reactions (Task #2) ───────────────────────────────────────────────────────


def test_get_messages_attaches_reactions_field():
    """`reactions` field is always present on each message (empty list when none)."""
    messages = [
        {"id": 1, "content": "hi", "mentions": []},
        {"id": 2, "content": "yo", "mentions": []},
    ]
    reactions = {
        1: [{"emoji": "👍", "count": 1, "players": [{"id": 100, "name": "Alice"}]}],
    }
    from api.routers.chat import router as chat_router

    app = FastAPI()
    app.include_router(chat_router)
    repo = _StubChatRepo(messages, reactions=reactions)
    store = _StubKeyStore()
    patches = [
        patch("api.routers.chat.chat_repo", repo),
        patch("api.routers.chat.chat_manager", object()),
        patch("api.routers.chat.key_store", store),
        patch("api.routers.chat.settings_repo", None),
    ]
    for p in patches:
        p.start()
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/api/chat/channels/1/messages",
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["messages"][0]["reactions"] == [
            {"emoji": "👍", "count": 1, "players": [{"id": 100, "name": "Alice"}]}
        ]
        assert body["messages"][1]["reactions"] == []
    finally:
        for p in patches:
            p.stop()
