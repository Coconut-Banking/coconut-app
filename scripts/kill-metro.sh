#!/usr/bin/env bash
# Free Metro ports before starting dev server (avoids 8081→8082 mismatch with dev client).
set -euo pipefail
for port in 8081 8082; do
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Killing process(es) on port $port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done
sleep 0.5
echo "Ports 8081/8082 clear."
