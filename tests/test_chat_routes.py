"""HTTP-level tests for api/routers/chat.py route validation.

These tests mount the chat router standalone and exercise FastAPI's
parameter validation layer — they intentionally do not depend on a
real chat_repo / chat_manager / key_store, because FastAPI rejects
invalid query params with 422 BEFORE any route handler (and its
dependency mocks) runs.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _app() -> FastAPI:
    from api.routers.chat import router as chat_router
    app = FastAPI()
    app.include_router(chat_router)
    return app


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
