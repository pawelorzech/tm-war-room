"""Scheduler leader-election for multi-worker deployments.

Only one worker may run the APScheduler at a time, otherwise every interval
job duplicates (each worker fires it). We use Redis SET NX EX to elect a
leader, with a background renewal task. If Redis is unavailable, we fall
back to a POSIX file lock on ``data/scheduler.leader.lock`` — also gives
"only one process holds it" semantics, which is sufficient for the common
case (multi-worker behind a single uvicorn/gunicorn host).

Followers (non-leaders) skip ``scheduler.start_in_background()`` entirely.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import socket
from typing import Any, Callable

logger = logging.getLogger("tm-hub.scheduler.leader")

LEADER_KEY = "tm:scheduler:leader"
LEADER_TTL_SECONDS = 30
LEADER_RENEW_INTERVAL_SECONDS = 10
# Followers retry acquire after the lease should have expired. +5s gives the
# previous owner a chance to actually let go before we try.
LEADER_FOLLOWER_RETRY_SECONDS = LEADER_TTL_SECONDS + 5
FILE_LOCK_PATH = "data/scheduler.leader.lock"


class LeaderElection:
    """Acquire and hold scheduler leadership for the lifetime of the process."""

    def __init__(self) -> None:
        self.is_leader: bool = False
        self._owner_id: str = f"{socket.gethostname()}:{os.getpid()}"
        self._renew_task: asyncio.Task | None = None
        self._watchdog_task: asyncio.Task | None = None
        self._file_lock_fd: int | None = None
        self._stopped = False
        self._promotion_callback: Callable[[], Any] | None = None

    def set_promotion_callback(self, callback: Callable[[], Any]) -> None:
        """Fires once when a follower is later promoted via the watchdog.

        Callback may be sync or async — coroutines are awaited.
        """
        self._promotion_callback = callback

    async def acquire(self) -> bool:
        """Try to become leader. Returns True if acquired."""
        ok = await self._try_acquire_redis()
        if ok is True:
            return True
        if ok is False:
            self._watchdog_task = asyncio.create_task(
                self._follower_watchdog(), name="scheduler-leader-watchdog",
            )
            return False
        return self._acquire_file_lock()

    async def _try_acquire_redis(self) -> bool | None:
        """Single Redis acquire attempt. True=leader, False=follower, None=Redis unavailable."""
        from api.redis_client import get_redis
        r = get_redis()
        if r is None:
            return None
        try:
            ok = await r.set(LEADER_KEY, self._owner_id, nx=True, ex=LEADER_TTL_SECONDS)
        except Exception as e:
            logger.warning("Redis leader-election failed (%s) — falling back to file lock.", e)
            return None
        if ok:
            self.is_leader = True
            logger.info("Scheduler leadership acquired via Redis (owner=%s).", self._owner_id)
            self._renew_task = asyncio.create_task(
                self._renew_loop(), name="scheduler-leader-renew",
            )
            return True
        try:
            current = await r.get(LEADER_KEY)
        except Exception:
            current = "?"
        logger.info("Scheduler leadership held by another worker (%s) — this worker is follower.", current)
        return False

    async def _follower_watchdog(self) -> None:
        """Periodically retry acquire. When a stale lease expires we promote ourselves."""
        while not self._stopped:
            try:
                await asyncio.sleep(LEADER_FOLLOWER_RETRY_SECONDS)
            except asyncio.CancelledError:
                return
            if self._stopped or self.is_leader:
                return
            from api.redis_client import get_redis
            r = get_redis()
            if r is None:
                continue
            try:
                ok = await r.set(LEADER_KEY, self._owner_id, nx=True, ex=LEADER_TTL_SECONDS)
            except Exception as e:
                logger.warning("Watchdog acquire attempt failed (%s) — will retry.", e)
                continue
            if not ok:
                continue
            # Promoted!
            self.is_leader = True
            logger.warning(
                "Scheduler leadership ACQUIRED LATE by follower watchdog (owner=%s) — "
                "previous lease likely expired after a crashed deploy. Promoting.",
                self._owner_id,
            )
            self._renew_task = asyncio.create_task(
                self._renew_loop(), name="scheduler-leader-renew",
            )
            cb = self._promotion_callback
            if cb is not None:
                try:
                    result = cb()
                    if asyncio.iscoroutine(result):
                        await result
                except Exception:
                    logger.exception("Promotion callback failed")
            return

    def _acquire_file_lock(self) -> bool:
        try:
            import fcntl
        except ImportError:
            logger.warning("No fcntl available — assuming leader (single-worker).")
            self.is_leader = True
            return True

        try:
            os.makedirs(os.path.dirname(FILE_LOCK_PATH), exist_ok=True)
            fd = os.open(FILE_LOCK_PATH, os.O_RDWR | os.O_CREAT, 0o644)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            os.write(fd, f"{self._owner_id}\n".encode())
            self._file_lock_fd = fd
            self.is_leader = True
            logger.info("Scheduler leadership acquired via file lock (%s, owner=%s).", FILE_LOCK_PATH, self._owner_id)
            return True
        except BlockingIOError:
            logger.info("Scheduler file lock held by another worker — this worker is follower.")
            return False
        except Exception as e:
            logger.warning("File lock failed (%s) — assuming leader (best effort).", e)
            self.is_leader = True
            return True

    async def _renew_loop(self) -> None:
        from api.redis_client import get_redis
        while not self._stopped:
            await asyncio.sleep(LEADER_RENEW_INTERVAL_SECONDS)
            r = get_redis()
            if r is None:
                continue
            try:
                # Only renew if we still own it. Use a tiny Lua to avoid races.
                lua = """
                if redis.call('GET', KEYS[1]) == ARGV[1] then
                    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
                else
                    return 0
                end
                """
                result = await r.eval(lua, 1, LEADER_KEY, self._owner_id, LEADER_TTL_SECONDS * 1000)
                if not result:
                    logger.warning(
                        "Scheduler leadership LOST (key changed under us). "
                        "This worker will keep running scheduled jobs until process restart."
                    )
                    self._stopped = True
                    break
            except Exception as e:
                logger.warning("Leader renewal failed: %s — will retry.", e)

    async def release(self) -> None:
        self._stopped = True
        for task in (self._renew_task, self._watchdog_task):
            if task and not task.done():
                task.cancel()
                with contextlib.suppress(Exception, asyncio.CancelledError):
                    await task
        from api.redis_client import get_redis
        r = get_redis()
        if r is not None and self.is_leader:
            try:
                lua = """
                if redis.call('GET', KEYS[1]) == ARGV[1] then
                    return redis.call('DEL', KEYS[1])
                else
                    return 0
                end
                """
                await r.eval(lua, 1, LEADER_KEY, self._owner_id)
            except Exception:
                pass
        if self._file_lock_fd is not None:
            try:
                import fcntl
                fcntl.flock(self._file_lock_fd, fcntl.LOCK_UN)
                os.close(self._file_lock_fd)
            except Exception:
                pass
            self._file_lock_fd = None
        self.is_leader = False
