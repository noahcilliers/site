#!/usr/bin/env bash
# Starts the Python bot and the Node site together (used by the Dockerfile).
# If either one exits, stop the other too, so the host restarts the container.
set -u

stop() { trap - TERM INT; kill 0 2>/dev/null; }
trap 'stop; exit 0' TERM INT

python bot/chessbot/server.py &
node src/main.js &

wait -n
status=$?
echo "A server exited (status $status); stopping the container."
stop
exit "$status"
