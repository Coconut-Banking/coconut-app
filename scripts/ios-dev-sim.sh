#!/usr/bin/env bash
# Build/install Coconut Dev on iOS Simulator with localhost Metro (avoids 192.0.0.2 deep link).
set -euo pipefail
cd "$(dirname "$0")/.."

export APP_VARIANT=dev
export CI=false
export NODE_OPTIONS='--disable-warning=DEP0169'
export REACT_NATIVE_PACKAGER_HOSTNAME=localhost

SIM_NAME="${COCONUT_SIM_NAME:-iPhone 17 Pro}"
SIM_UDID="${COCONUT_SIM_UDID:-655B1AFD-8535-4DEF-84B7-74D104EA28A1}"
INSTALL_ONLY=false
OPEN_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --install-only) INSTALL_ONLY=true ;;
    --open-only) OPEN_ONLY=true ;;
  esac
done

boot_sim() {
  xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
  open -a Simulator
}

metro_up() {
  curl -sf "http://localhost:8081/status" >/dev/null 2>&1
}

if $OPEN_ONLY; then
  exec bash scripts/ios-sim-open.sh "$SIM_UDID"
fi

boot_sim

if $INSTALL_ONLY; then
  echo "Installing on $SIM_NAME (no Metro)…"
  npx expo run:ios -d "$SIM_NAME" --no-bundler
  echo "Done. Start Metro: npm run ios:dev:sim:metro"
  echo "Then connect: npm run ios:dev:sim:open"
  exit 0
fi

if metro_up; then
  echo "Metro already on :8081 — install only, then open localhost URL…"
  npx expo run:ios -d "$SIM_NAME" --no-bundler
  bash scripts/ios-sim-open.sh "$SIM_UDID"
  exit 0
fi

echo "Building $SIM_NAME and starting Metro on localhost:8081…"
echo "If the dev launcher shows 192.0.0.x, tap Enter URL manually → http://localhost:8081"
echo "Or after this finishes: npm run ios:dev:sim:open (with Metro still running)"

# After a few seconds, push the correct deep link (Expo often opens 192.0.0.2).
( sleep 12 && bash scripts/ios-sim-open.sh "$SIM_UDID" ) &
OPEN_PID=$!
trap 'kill "$OPEN_PID" 2>/dev/null || true' EXIT

npx expo run:ios -d "$SIM_NAME" --port 8081
