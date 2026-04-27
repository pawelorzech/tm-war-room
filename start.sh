#!/bin/sh
set -e

# Sprint 2 #1+#19: multi-worker via gunicorn with uvicorn workers.
# Scheduler leader-election (api/scheduler/leader.py) ensures only one worker
# actually runs APScheduler jobs; chat broadcasts go through Redis pub/sub
# (when REDIS_URL is set) so messages reach clients on any worker.
#
# Worker count: default 2; override via WEB_CONCURRENCY env var.
# WebSocket NOTE: each WS connection sticks to a single worker for its
# lifetime (nginx proxy_pass keeps the upstream connection open). With
# Redis pub/sub this is correct — broadcasts fan out to all workers.
# Without Redis it degrades to per-worker chat (users only see messages
# from peers on the same worker). Run with WEB_CONCURRENCY=1 for that.

WORKERS="${WEB_CONCURRENCY:-2}"

gunicorn api.main:app \
  --workers "$WORKERS" \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8001 \
  --timeout 60 \
  --graceful-timeout 30 \
  --keep-alive 5 \
  --access-logfile - \
  --error-logfile - &

# Start nginx in the foreground (serves on port 8000)
nginx -g 'daemon off;'
