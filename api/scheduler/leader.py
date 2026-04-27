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

logger = logging.getLogger("tm-hub.scheduler.leader")

LEADER_KEY = "tm:scheduler:leader"
LEADER_TTL_SECONDS = 30
LEADER_RENEW_INTERVAL_SECONDS = 10
FILE_LOCK_PATH = "data/scheduler.leader.lock"


class LeaderElection:
    """Acquire and hold scheduler leadership for the lifetime of the process."""

    def __init__(self) -> None:
        self.is_leader: bool = False
        self._owner_id: str = f"{socket.gethostname()}:{os.getpid()}"
        self._renew_task: asyncio.Task | None = None
        self._file_lock_fd: int | None = None
        self._stopped = False

    async def acquire(self) -> bool:
        """Try to become leader. Returns True if acquired (caller starts scheduler)."""
        from api.redis_client import get_redis
        r = get_redis()
        if r is not None:
            try:
                ok = await r.set(LEADER_KEY, self._owner_id, nx=True, ex=LEADER_TTL_SECONDS)
                if ok:
                    self.is_leader = True
                    logger.info("Scheduler leadership acquired via Redis (owner=%s).", self._owner_id)
                    self._renew_task = asyncio.create_task(
                        self._renew_loop(), name="scheduler-leader-renew",
                    )
                    return True
                else:
                    current = await r.get(LEADER_KEY)
                    logger.info("Scheduler leadership held by another worker (%s) — this worker is follower.", current)
                    return False
            except Exception as e:
                logger.warning("Redis leader-election failed (%s) — falling back to file lock.", e)

        # Fallback: POSIX advisory file lock.
        return self._acquire_file_lock()

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
        if self._renew_task and not self._renew_task.done():
            self._renew_task.cancel()
            with contextlib.suppress(Exception, asyncio.CancelledError):
                await self._renew_task
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
