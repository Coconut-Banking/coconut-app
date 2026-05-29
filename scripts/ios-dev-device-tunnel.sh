#!/usr/bin/env bash
# Metro for physical iPhone — tries Expo tunnel (corporate Wi‑Fi), falls back to LAN.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run metro:kill

export APP_VARIANT=dev
export CI=false
export NODE_OPTIONS='--disable-warning=DEP0169'

echo "Starting Metro with tunnel (ngrok)…"
if npx expo start --dev-client --tunnel --clear --port 8081; then
  exit 0
fi

echo ""
echo "Tunnel failed (common on ngrok outages or missing authtoken)."
echo "Starting LAN Metro instead — phone must be on the same Wi‑Fi as this Mac."
echo ""

export REACT_NATIVE_PACKAGER_HOSTNAME="$(
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost
)"
echo "LAN URL: http://${REACT_NATIVE_PACKAGER_HOSTNAME}:8081"
exec npx expo start --dev-client --clear --port 8081
