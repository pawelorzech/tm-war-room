#!/bin/sh
set -e

# Start uvicorn in the background (internal port, nginx proxies to it)
uvicorn api.main:app --host 127.0.0.1 --port 8001 &

# Start nginx in the foreground (serves on port 8000)
nginx -g 'daemon off;'
