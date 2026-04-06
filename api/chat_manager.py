from __future__ import annotations
import json
import logging
from fastapi import WebSocket

logger = logging.getLogger("tm-hub.chat")


class ChatManager:
    """In-memory WebSocket connection manager for real-time chat."""

    def __init__(self):
        # player_id -> WebSocket
        self._connections: dict[int, WebSocket] = {}

    async def connect(self, player_id: int, ws: WebSocket) -> None:
        await ws.accept()
        old = self._connections.get(player_id)
        if old:
            try:
                await old.close(code=4001, reason="new_connection")
            except Exception:
                pass
        self._connections[player_id] = ws
        logger.info("Chat WS connected: player %d (%d total)", player_id, len(self._connections))

    def disconnect(self, player_id: int) -> None:
        self._connections.pop(player_id, None)
        logger.info("Chat WS disconnected: player %d (%d total)", player_id, len(self._connections))

    def get_online_players(self) -> list[int]:
        return list(self._connections.keys())

    async def broadcast(self, message: dict, exclude: int | None = None) -> None:
        """Broadcast a message to all connected clients."""
        payload = json.dumps(message)
        disconnected = []
        for pid, ws in self._connections.items():
            if pid == exclude:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            self._connections.pop(pid, None)

    async def send_to_player(self, player_id: int, message: dict) -> bool:
        """Send a message to a specific player. Returns True if delivered."""
        ws = self._connections.get(player_id)
        if not ws:
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception:
            self._connections.pop(player_id, None)
            return False

    async def close_all(self) -> None:
        """Close all connections (used on shutdown)."""
        for ws in self._connections.values():
            try:
                await ws.close(code=1001, reason="server_shutdown")
            except Exception:
                pass
        self._connections.clear()
