"""Chat WebSocket connection manager.

Multi-worker safe: when Redis is available, broadcasts go via Redis pub/sub
so messages reach clients connected to any worker. The per-worker
``_connections`` dict only tracks WebSockets attached to THIS worker; the
subscriber loop (started in ``main.py`` lifespan) re-broadcasts every
message it receives from Redis to those local sockets.

Online presence: each connected user has a Redis key
``tm:chat:online:<player_id>`` with TTL 60s, refreshed by a background
heartbeat task (in ``main.py`` lifespan). Online list = SCAN of that key
prefix. When Redis is unavailable, falls back to per-worker view (still
correct, just narrower).

Single-worker / no-Redis: behaviour identical to old in-memory manager.
"""
from __future__ import annotations
import asyncio
import contextlib
import json
import logging
import os
import time
from typing import Optional

from fastapi import WebSocket

from api.redis_client import get_redis

logger = logging.getLogger("tm-hub.chat")

PUBSUB_CHANNEL = "tm:chat:broadcast"
ONLINE_KEY_PREFIX = "tm:chat:online:"
ONLINE_TTL_SECONDS = 60
HEARTBEAT_INTERVAL_SECONDS = 30


class ChatManager:
    """WebSocket connection manager with Redis pub/sub for multi-worker broadcast."""

    def __init__(self):
        # player_id -> WebSocket. Only tracks connections on THIS worker.
        self._connections: dict[int, WebSocket] = {}
        # Background tasks owned by this manager (subscriber + heartbeat).
        self._subscriber_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._stopped = False
        # Stable identifier for this worker, so we can deduplicate self-publishes.
        self._worker_id = f"{os.getpid()}-{id(self)}"

    async def connect(self, player_id: int, ws: WebSocket) -> None:
        await ws.accept()
        old = self._connections.get(player_id)
        if old:
            try:
                await old.close(code=4001, reason="new_connection")
            except Exception:
                pass
        self._connections[player_id] = ws
        await self._mark_online(player_id)
        logger.info(
            "Chat WS connected: player %d (%d local, worker %s)",
            player_id, len(self._connections), self._worker_id,
        )

    def disconnect(self, player_id: int) -> None:
        self._connections.pop(player_id, None)
        # Best-effort: drop online key (sync schedule).
        r = get_redis()
        if r is not None:
            try:
                asyncio.get_running_loop().create_task(self._unmark_online(player_id))
            except RuntimeError:
                pass
        logger.info(
            "Chat WS disconnected: player %d (%d local)",
            player_id, len(self._connections),
        )

    async def get_online_players(self) -> list[int]:
        """Return online player IDs across the entire cluster (Redis) or local-only."""
        r = get_redis()
        if r is None:
            return list(self._connections.keys())
        ids: set[int] = set()
        try:
            async for key in r.scan_iter(match=f"{ONLINE_KEY_PREFIX}*", count=100):
                # key is "tm:chat:online:<id>"
                suffix = key[len(ONLINE_KEY_PREFIX):]
                try:
                    ids.add(int(suffix))
                except ValueError:
                    continue
        except Exception as e:
            logger.warning("Redis SCAN online failed (%s) — falling back to local.", e)
            return list(self._connections.keys())
        # Always include locally-connected (in case TTL expired right at SCAN time).
        ids.update(self._connections.keys())
        return sorted(ids)

    async def broadcast(self, message: dict, exclude: int | None = None) -> None:
        """Publish to all clients in the cluster (or just locally if no Redis)."""
        envelope = {
            "_origin": self._worker_id,
            "exclude": exclude,
            "message": message,
        }
        r = get_redis()
        if r is not None:
            try:
                await r.publish(PUBSUB_CHANNEL, json.dumps(envelope))
                # Subscriber loop will deliver to local connections, including ours.
                return
            except Exception as e:
                logger.warning("Redis publish failed (%s) — local broadcast only.", e)
        # Fallback path: deliver locally.
        await self._deliver_local(message, exclude=exclude)

    async def send_to_player(self, player_id: int, message: dict) -> bool:
        """Send to a specific player; works cluster-wide via pub/sub.

        Returns True if delivered locally OR successfully published to Redis.
        Does NOT confirm cluster delivery — that's fire-and-forget.
        """
        # Fast path: connected to us.
        ws = self._connections.get(player_id)
        if ws is not None:
            try:
                await ws.send_text(json.dumps(message))
                return True
            except Exception:
                self._connections.pop(player_id, None)
                # Fall through to pub/sub in case they reconnected to another worker.
        r = get_redis()
        if r is None:
            return False
        envelope = {
            "_origin": self._worker_id,
            "target": player_id,
            "message": message,
        }
        try:
            await r.publish(PUBSUB_CHANNEL, json.dumps(envelope))
            return True
        except Exception as e:
            logger.warning("Redis publish to player %d failed (%s).", player_id, e)
            return False

    async def close_all(self) -> None:
        self._stopped = True
        for ws in self._connections.values():
            try:
                await ws.close(code=1001, reason="server_shutdown")
            except Exception:
                pass
        self._connections.clear()
        for task in (self._subscriber_task, self._heartbeat_task):
            if task and not task.done():
                task.cancel()
                with contextlib.suppress(Exception):
                    await task

    # ── Background tasks (started from main.py lifespan) ────────────────

    async def start_background_tasks(self) -> None:
        """Start Redis subscriber + heartbeat loops. Idempotent. No-op without Redis."""
        if get_redis() is None:
            logger.info("Redis not available — chat broadcasts are local-worker only.")
            return
        if self._subscriber_task is None or self._subscriber_task.done():
            self._subscriber_task = asyncio.create_task(
                self._subscribe_loop(), name="chat-redis-subscriber"
            )
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(
                self._heartbeat_loop(), name="chat-online-heartbeat"
            )

    async def _subscribe_loop(self) -> None:
        """Subscribe to Redis broadcast channel, deliver to local connections."""
        backoff = 1.0
        while not self._stopped:
            r = get_redis()
            if r is None:
                await asyncio.sleep(5)
                continue
            try:
                pubsub = r.pubsub()
                await pubsub.subscribe(PUBSUB_CHANNEL)
                logger.info("Chat subscribed to Redis channel %s", PUBSUB_CHANNEL)
                backoff = 1.0
                async for msg in pubsub.listen():
                    if self._stopped:
                        break
                    if msg.get("type") != "message":
                        continue
                    try:
                        envelope = json.loads(msg["data"])
                    except Exception:
                        continue
                    target = envelope.get("target")
                    payload = envelope.get("message")
                    exclude = envelope.get("exclude")
                    if not isinstance(payload, dict):
                        continue
                    if target is not None:
                        # Direct send to a specific player on whichever worker has them.
                        ws = self._connections.get(int(target))
                        if ws is not None:
                            try:
                                await ws.send_text(json.dumps(payload))
                            except Exception:
                                self._connections.pop(int(target), None)
                    else:
                        await self._deliver_local(payload, exclude=exclude)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Chat subscriber loop error: %s — retry in %.1fs", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
        logger.info("Chat subscriber loop exited.")

    async def _heartbeat_loop(self) -> None:
        """Refresh online TTL for all locally-connected players."""
        while not self._stopped:
            r = get_redis()
            if r is None:
                await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
                continue
            try:
                if self._connections:
                    pipe = r.pipeline()
                    for pid in self._connections:
                        pipe.set(f"{ONLINE_KEY_PREFIX}{pid}", "1", ex=ONLINE_TTL_SECONDS)
                    await pipe.execute()
            except Exception as e:
                logger.warning("Chat heartbeat error: %s", e)
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)

    # ── Internals ───────────────────────────────────────────────────────

    async def _deliver_local(self, message: dict, exclude: int | None = None) -> None:
        payload = json.dumps(message)
        disconnected: list[int] = []
        for pid, ws in self._connections.items():
            if pid == exclude:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            self._connections.pop(pid, None)

    async def _mark_online(self, player_id: int) -> None:
        r = get_redis()
        if r is None:
            return
        try:
            await r.set(f"{ONLINE_KEY_PREFIX}{player_id}", "1", ex=ONLINE_TTL_SECONDS)
        except Exception as e:
            logger.warning("Redis mark_online(%d) failed: %s", player_id, e)

    async def _unmark_online(self, player_id: int) -> None:
        r = get_redis()
        if r is None:
            return
        try:
            await r.delete(f"{ONLINE_KEY_PREFIX}{player_id}")
        except Exception:
            pass
