"""Hit-claim SSE fan-out manager.

Mirrors ``api/chat_manager.py``: multi-worker safe via Redis pub/sub when
``REDIS_URL`` is set, graceful per-worker fallback when not. Each SSE
connection owns one ``asyncio.Queue`` registered under a faction_id; every
state change (created/released/expired/hit) drops one envelope into every
queue subscribed to that faction.

Why a queue per connection (not a fan-out broadcast):

* SSE responses are async generators owned by one Starlette
  ``StreamingResponse``. They must yield as bytes — we can't push from a
  callback. A queue per stream lets the producer (publish/sweeper) hand
  off cheaply without awaiting the slow client.
* On Redis pub/sub fan-in, ``_subscribe_loop`` reads each envelope once
  and forwards into every local queue subscribed to that faction. We
  dedupe self-publishes via ``worker_id`` so the same Python process
  doesn't deliver an event twice (once locally, once via Redis).

Single-worker / no-Redis: ``publish()`` skips Redis and writes straight
into the queues. Behaviour identical to a plain in-memory broadcaster.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
from typing import AsyncIterator, Optional

from api.redis_client import get_redis

logger = logging.getLogger("tm-hub.claims")

PUBSUB_CHANNEL_PREFIX = "tm:claims:faction:"
# Per-connection queue size cap. A slow SSE client shouldn't pin memory
# indefinitely — we drop the oldest event when the buffer is saturated
# rather than back-pressure the publisher (claim flow must stay fast).
QUEUE_MAX_SIZE = 256


def _channel_for(faction_id: int) -> str:
    return f"{PUBSUB_CHANNEL_PREFIX}{faction_id}"


class ClaimManager:
    """SSE connection manager with Redis pub/sub for multi-worker fan-out.

    Lifecycle:
      * Construct in main.py lifespan.
      * ``await start()`` once — starts the Redis subscriber background task.
        Idempotent and a no-op without Redis.
      * Routers call ``publish(event, faction_id)`` on every state change.
      * Routers call ``stream(faction_id)`` and iterate; each yielded dict
        is one envelope. Caller is responsible for the SSE framing.
      * ``await stop()`` on shutdown — cancels the subscriber and drains.
    """

    def __init__(self, key_store=None):
        # faction_id -> set of queues, one per active SSE connection.
        self._subscribers: dict[int, set[asyncio.Queue]] = {}
        self._subscriber_task: Optional[asyncio.Task] = None
        self._stopped = False
        # Stable per-process id so subscribers can detect (and skip) the
        # envelope they themselves just published over Redis.
        self._worker_id = f"{os.getpid()}-{id(self)}"
        # Track factions we've subscribed to so we can SUBSCRIBE lazily.
        self._subscribed_channels: set[str] = set()
        self._key_store = key_store
        # Future channel set, accumulated as factions get their first subscriber.
        # We use psubscribe to one prefix so the manager doesn't have to track
        # SUBSCRIBE/UNSUBSCRIBE as factions come and go.
        self._psubscribe_pattern = f"{PUBSUB_CHANNEL_PREFIX}*"

    # ── Lifecycle ──────────────────────────────────────────────────

    async def start(self) -> None:
        """Start the Redis pub/sub subscriber loop. Idempotent, no-op without Redis."""
        if self._subscriber_task is not None and not self._subscriber_task.done():
            return
        if get_redis() is None:
            logger.info(
                "ClaimManager: REDIS_URL not set — local fan-out only (single-worker mode)."
            )
            return
        self._stopped = False
        self._subscriber_task = asyncio.create_task(
            self._subscribe_loop(), name="claims-redis-subscriber"
        )

    async def stop(self) -> None:
        self._stopped = True
        if self._subscriber_task and not self._subscriber_task.done():
            self._subscriber_task.cancel()
            with contextlib.suppress(Exception):
                await self._subscriber_task
        # Close every outstanding queue so any blocked SSE consumer wakes up
        # and exits its generator cleanly.
        for queues in self._subscribers.values():
            for q in queues:
                with contextlib.suppress(asyncio.QueueFull):
                    q.put_nowait(None)
        self._subscribers.clear()

    # ── Publish ────────────────────────────────────────────────────

    async def publish(self, claim_event: dict, faction_id: int) -> None:
        """Publish a claim state-change event to every subscriber in ``faction_id``.

        Adds the ``worker_id`` and ``ts`` envelope fields, delivers locally
        immediately, and (if Redis is up) publishes to the pub/sub channel
        so subscribers on other workers see the same event. Local delivery
        does NOT wait on Redis — claim flow must stay snappy.
        """
        envelope = dict(claim_event)
        envelope.setdefault("type", "claim.unknown")
        envelope["faction_id"] = faction_id
        envelope["worker_id"] = self._worker_id
        envelope.setdefault("ts", int(time.time()))

        # 1. Local fan-out — instant.
        self._deliver_local(envelope, faction_id)

        # 2. Redis fan-out for cross-worker — best-effort.
        r = get_redis()
        if r is None:
            return
        try:
            await r.publish(_channel_for(faction_id), json.dumps(envelope))
        except Exception as e:
            logger.warning(
                "Redis publish to %s failed (%s) — local delivery only.",
                _channel_for(faction_id), e,
            )

    # ── SSE stream ─────────────────────────────────────────────────

    async def stream(self, faction_id: int) -> AsyncIterator[dict]:
        """Yield claim envelopes for one SSE connection.

        Caller iterates this in a route handler that wraps each yield as an
        SSE ``data:`` frame. A ``None`` value (used during shutdown) breaks
        the loop so the generator finishes promptly.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX_SIZE)
        self._subscribers.setdefault(faction_id, set()).add(queue)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    return
                yield event
        finally:
            subs = self._subscribers.get(faction_id)
            if subs:
                subs.discard(queue)
                if not subs:
                    self._subscribers.pop(faction_id, None)

    def subscriber_count(self, faction_id: int) -> int:
        """Local subscriber count — useful for tests and instrumentation."""
        return len(self._subscribers.get(faction_id, ()))

    # ── Internals ──────────────────────────────────────────────────

    def _deliver_local(self, envelope: dict, faction_id: int) -> None:
        """Drop ``envelope`` into every local queue subscribed to ``faction_id``.

        Bounded queue: if a slow SSE client has filled its buffer we drop the
        oldest event rather than blocking the producer. The companion
        re-fetches active claims on (re)connect, so a missed event mid-stream
        is recoverable.
        """
        queues = self._subscribers.get(faction_id)
        if not queues:
            return
        for q in list(queues):
            try:
                q.put_nowait(envelope)
            except asyncio.QueueFull:
                with contextlib.suppress(Exception):
                    q.get_nowait()  # drop oldest
                with contextlib.suppress(asyncio.QueueFull):
                    q.put_nowait(envelope)

    async def _subscribe_loop(self) -> None:
        """Subscribe to the claim pub/sub pattern, fan-in to local queues."""
        backoff = 1.0
        while not self._stopped:
            r = get_redis()
            if r is None:
                await asyncio.sleep(5)
                continue
            try:
                pubsub = r.pubsub()
                await pubsub.psubscribe(self._psubscribe_pattern)
                logger.info(
                    "ClaimManager subscribed to Redis pattern %s",
                    self._psubscribe_pattern,
                )
                backoff = 1.0
                async for msg in pubsub.listen():
                    if self._stopped:
                        break
                    if msg.get("type") not in ("pmessage", "message"):
                        continue
                    try:
                        envelope = json.loads(msg["data"])
                    except Exception:
                        continue
                    # Skip self-publishes — we already delivered locally before
                    # putting the event on the wire.
                    if envelope.get("worker_id") == self._worker_id:
                        continue
                    faction_id = envelope.get("faction_id")
                    if not isinstance(faction_id, int):
                        continue
                    self._deliver_local(envelope, faction_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(
                    "Claims subscriber loop error: %s — retry in %.1fs", e, backoff,
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
        logger.info("ClaimManager subscriber loop exited.")
