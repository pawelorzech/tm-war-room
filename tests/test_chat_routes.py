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


# ── Slash commands (Task #3) ──────────────────────────────────────────────────


class _SendChatRepo(_StubChatRepo):
    """Sender-side stub: track create_message calls + rate-limit/mute helpers
    so send_message can run end-to-end."""

    def __init__(self):
        super().__init__([])
        self.created = []

    def is_muted(self, _player_id):
        return False

    def create_message(self, channel_id, player_id, player_name, content, mentions=None, **kw):
        msg = {
            "id": len(self.created) + 1,
            "channel_id": channel_id,
            "thread_id": None,
            "player_id": player_id,
            "player_name": player_name,
            "content": content,
            "bot_id": kw.get("bot_id"),
            "mentions": mentions or [],
            "pinned": 0,
            "deleted": 0,
            "created_at": 1,
            "edited_at": None,
        }
        self.created.append(msg)
        return msg

    def update_read_position(self, *_args, **_kw):
        return None


class _StubChatManager:
    def __init__(self):
        self.broadcasts = []

    async def broadcast(self, msg):
        self.broadcasts.append(msg)


class _StubKeyStoreWithName(_StubKeyStore):
    def get_key(self, player_id):
        return {"player_name": "Alice"}


def _mount_send():
    """Mount the chat router with stubs sufficient for send_message paths."""
    from api.routers.chat import router as chat_router
    app = FastAPI()
    app.include_router(chat_router)
    repo = _SendChatRepo()
    manager = _StubChatManager()
    store = _StubKeyStoreWithName()
    patches = [
        patch("api.routers.chat.chat_repo", repo),
        patch("api.routers.chat.chat_manager", manager),
        patch("api.routers.chat.key_store", store),
        patch("api.routers.chat.settings_repo", None),
    ]
    for p in patches:
        p.start()
    return app, patches, repo, manager


def test_help_command_returns_ephemeral_without_persisting():
    app, patches, repo, manager = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={"content": "/help", "mentions": []},
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("ephemeral") is True
        assert "Available commands" in body["content"] or "/help" in body["content"]
        assert repo.created == [], "ephemeral commands must not hit the DB"
        assert manager.broadcasts == [], "ephemeral commands must not broadcast"
    finally:
        for p in patches:
            p.stop()


def test_unknown_command_returns_ephemeral_hint_not_broadcast():
    app, patches, repo, manager = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={"content": "/notacommand stuff", "mentions": []},
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("ephemeral") is True
        assert "Unknown command" in body["content"]
        assert "/notacommand" in body["content"]
        assert repo.created == []
        assert manager.broadcasts == []
    finally:
        for p in patches:
            p.stop()


def test_regular_message_is_not_intercepted_by_command_parser():
    app, patches, repo, manager = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={"content": "hey team, ready for chain?", "mentions": []},
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("ephemeral") is not True
        assert body["content"] == "hey team, ready for chain?"
        assert len(repo.created) == 1
        assert len(manager.broadcasts) == 1
    finally:
        for p in patches:
            p.stop()


def test_slash_alone_is_treated_as_plain_text():
    app, patches, repo, manager = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={"content": "/", "mentions": []},
                headers={"X-Player-Id": "123"},
            )
        # Bare "/" is whitespace-only after strip → 400 from existing guard
        # which is fine; what matters is no ephemeral response was issued.
        assert resp.status_code in (200, 400)
        if resp.status_code == 200:
            body = resp.json()
            assert body.get("ephemeral") is not True
    finally:
        for p in patches:
            p.stop()


def test_list_commands_endpoint_returns_help():
    app, patches, _repo, _mgr = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/api/chat/commands",
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        names = [c["name"] for c in body["commands"]]
        assert "help" in names
    finally:
        for p in patches:
            p.stop()


# ── Live entity enrichment on send/edit (spindle preview bug fix) ─────────────
# Regression: backend used to attach `entities` only for GET ?include=entities.
# POST send response, WS broadcast on new message, and WS broadcast on edit all
# shipped without `entities`, so spindle cards only appeared after a refresh.
# The contract these tests pin: every payload that crosses the network carries
# `entities: list[dict]` — same shape as find_entities_as_dicts() output —
# always present, empty list when nothing detected.


def _last_broadcast_payload(manager: "_StubChatManager") -> dict:
    """Pull the most recently broadcast message payload (the dict under 'payload')."""
    assert manager.broadcasts, "expected at least one broadcast"
    return manager.broadcasts[-1]


def test_send_message_response_includes_entities_for_profile_url():
    """POST response carries `entities` with a player ref for a Torn profile URL."""
    app, patches, _repo, _mgr = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={
                    "content": "check out https://www.torn.com/profiles.php?XID=2362436",
                    "mentions": [],
                },
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "entities" in body, "response must always carry an `entities` field"
        players = [e for e in body["entities"] if e.get("kind") == "player"]
        assert players, f"expected a player entity, got: {body['entities']!r}"
        assert any(e.get("id") == 2362436 for e in players)
    finally:
        for p in patches:
            p.stop()


def test_send_message_broadcast_includes_entities():
    """WS broadcast payload also carries `entities` so live receivers render cards."""
    app, patches, _repo, manager = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={
                    "content": "check out https://www.torn.com/profiles.php?XID=2362436",
                    "mentions": [],
                },
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        envelope = _last_broadcast_payload(manager)
        assert envelope["type"] == "message"
        payload = envelope["payload"]
        assert "entities" in payload, "broadcast payload must carry `entities`"
        players = [e for e in payload["entities"] if e.get("kind") == "player"]
        assert any(e.get("id") == 2362436 for e in players), (
            f"expected player 2362436 in broadcast entities, got: {payload['entities']!r}"
        )
    finally:
        for p in patches:
            p.stop()


def test_send_message_response_has_empty_entities_for_plain_text():
    """Field is always present even when nothing was detected — empty list."""
    app, patches, _repo, manager = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={"content": "just plain text, nothing special", "mentions": []},
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "entities" in body, "`entities` must be present on every message"
        assert body["entities"] == [], (
            f"expected [] for plain text, got: {body['entities']!r}"
        )
        # Broadcast carries the same shape.
        envelope = _last_broadcast_payload(manager)
        assert envelope["payload"]["entities"] == []
    finally:
        for p in patches:
            p.stop()


def test_send_message_response_includes_entities_for_item_url():
    """Item URL produces an `item` entity with the numeric XID."""
    app, patches, _repo, _mgr = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={
                    "content": "need https://www.torn.com/item.php?XID=206",
                    "mentions": [],
                },
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        items = [e for e in body.get("entities", []) if e.get("kind") == "item"]
        assert items, f"expected an item entity, got: {body.get('entities')!r}"
        assert any(e.get("id") == 206 for e in items)
    finally:
        for p in patches:
            p.stop()


def test_send_message_response_includes_entities_for_player_shorthand():
    """[NNN] shorthand also resolves to a player entity in the live payload."""
    app, patches, _repo, _mgr = _mount_send()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/channels/1/messages",
                json={"content": "reminder for [2362436]", "mentions": []},
                headers={"X-Player-Id": "123"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        players = [e for e in body.get("entities", []) if e.get("kind") == "player"]
        assert any(e.get("id") == 2362436 for e in players), (
            f"expected player 2362436 from [2362436] shorthand, got: {body.get('entities')!r}"
        )
    finally:
        for p in patches:
            p.stop()


class _EditableChatRepo(_SendChatRepo):
    """Sender stub extended with edit_message support so PUT edit_message
    can flow end-to-end against a stub backend."""

    def edit_message(self, message_id, player_id, new_content):
        # Mirror BaseRepository.edit_message: True iff caller owns the message.
        for m in self.created:
            if m["id"] == message_id and m["player_id"] == player_id:
                m["content"] = new_content
                m["edited_at"] = 1
                return True
        return False


def _mount_send_editable():
    """Same as _mount_send but with an edit-capable repo stub.

    Also bypasses `_msg_rate_ok` — the rate limiter holds module-level state
    across tests in this file, and a multi-POST flow (create + edit) added on
    top of earlier send tests can otherwise trip the 10-msg/5s window.
    """
    from api.routers.chat import router as chat_router
    app = FastAPI()
    app.include_router(chat_router)
    repo = _EditableChatRepo()
    manager = _StubChatManager()
    store = _StubKeyStoreWithName()
    patches = [
        patch("api.routers.chat.chat_repo", repo),
        patch("api.routers.chat.chat_manager", manager),
        patch("api.routers.chat.key_store", store),
        patch("api.routers.chat.settings_repo", None),
        patch("api.routers.chat._msg_rate_ok", lambda _pid: True),
    ]
    for p in patches:
        p.start()
    return app, patches, repo, manager


def test_edit_message_broadcast_includes_entities():
    """PUT edit broadcasts a payload with `entities` derived from the new content,
    so live spindle cards refresh without a page reload."""
    app, patches, _repo, manager = _mount_send_editable()
    try:
        with TestClient(app) as client:
            # Create first so there's something owned by player 123 to edit.
            create_resp = client.post(
                "/api/chat/channels/1/messages",
                json={"content": "original plain text", "mentions": []},
                headers={"X-Player-Id": "123"},
            )
            assert create_resp.status_code == 200, create_resp.text
            msg_id = create_resp.json()["id"]

            edit_resp = client.put(
                f"/api/chat/messages/{msg_id}",
                json={"content": "oops https://www.torn.com/profiles.php?XID=999"},
                headers={"X-Player-Id": "123"},
            )
        assert edit_resp.status_code == 200, edit_resp.text
        # Pull the last broadcast (the edit, not the original create).
        edit_envelopes = [b for b in manager.broadcasts if b.get("type") == "edit"]
        assert edit_envelopes, "expected an edit broadcast"
        payload = edit_envelopes[-1]["payload"]
        assert "entities" in payload, "edit broadcast payload must carry `entities`"
        players = [e for e in payload["entities"] if e.get("kind") == "player"]
        assert any(e.get("id") == 999 for e in players), (
            f"expected player 999 from edited URL, got: {payload['entities']!r}"
        )
    finally:
        for p in patches:
            p.stop()


def test_edit_message_broadcast_entities_reflects_new_content_not_old():
    """Edit broadcast `entities` is derived from the NEW content. Guards against
    accidentally re-detecting from the message's original content."""
    app, patches, _repo, manager = _mount_send_editable()
    try:
        with TestClient(app) as client:
            create_resp = client.post(
                "/api/chat/channels/1/messages",
                json={
                    "content": "first https://www.torn.com/profiles.php?XID=111",
                    "mentions": [],
                },
                headers={"X-Player-Id": "123"},
            )
            assert create_resp.status_code == 200, create_resp.text
            msg_id = create_resp.json()["id"]

            edit_resp = client.put(
                f"/api/chat/messages/{msg_id}",
                json={"content": "second https://www.torn.com/profiles.php?XID=222"},
                headers={"X-Player-Id": "123"},
            )
        assert edit_resp.status_code == 200, edit_resp.text
        edit_envelopes = [b for b in manager.broadcasts if b.get("type") == "edit"]
        assert edit_envelopes, "expected an edit broadcast"
        payload = edit_envelopes[-1]["payload"]
        player_ids = {e.get("id") for e in payload["entities"] if e.get("kind") == "player"}
        assert 222 in player_ids, (
            f"edit broadcast must reflect NEW content (XID=222), got: {payload['entities']!r}"
        )
        assert 111 not in player_ids, (
            f"edit broadcast must NOT re-emit the original XID=111, got: {payload['entities']!r}"
        )
    finally:
        for p in patches:
            p.stop()
