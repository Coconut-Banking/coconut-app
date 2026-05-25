#!/usr/bin/env bash
# Build and install Coconut Dev on a connected iPhone (Tap to Pay + com.coconut.app.dev).
#
# Uses xcodebuild with -allowProvisioningUpdates so Xcode can create a Development
# profile for com.coconut.app.dev. Plain `expo run:ios` skips those flags when
# DEVELOPMENT_TEAM is already set in the Xcode project.
set -euo pipefail
cd "$(dirname "$0")/.."

export APP_VARIANT=dev
export ENABLE_TAP_TO_PAY_IOS=true
export CI=false
export NODE_OPTIONS='--disable-warning=DEP0169'
export REACT_NATIVE_PACKAGER_HOSTNAME="$(
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost
)"

TEAM_ID="${APPLE_TEAM_ID:-942BUGUD75}"
WORKSPACE="ios/Coconut.xcworkspace"
SCHEME="Coconut"
CONFIG="Debug"

pick_device_udid() {
  if [[ -n "${COCONUT_DEVICE_UDID:-}" ]]; then
    echo "$COCONUT_DEVICE_UDID"
    return
  fi

  local udid=""

  # Best source: xcdevice JSON (name spelling does not matter)
  if command -v python3 >/dev/null 2>&1; then
    udid="$(
      xcrun xcdevice list 2>/dev/null | python3 -c "
import json, sys
try:
    devices = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(1)
for d in devices:
    if d.get('simulator'):
        continue
    if d.get('platform') != 'com.apple.platform.iphoneos':
        continue
    if d.get('available') is False:
        continue
    print(d['identifier'])
    sys.exit(0)
sys.exit(1)
" 2>/dev/null || true
    )"
    if [[ -n "$udid" ]]; then
      echo "$udid"
      return
    fi
  fi

  # Fallback: xctrace — last parenthesized UDID on the line (skips OS version like 26.3.1)
  local line
  while IFS= read -r line; do
    [[ "$line" == "=="* ]] && break
    [[ "$line" == *Simulator* ]] && continue
    [[ "$line" == MacBook* ]] && continue
    udid=$(echo "$line" | grep -oE '\([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\)' | tail -1 | tr -d '()')
    if [[ -n "$udid" ]]; then
      echo "$udid"
      return
    fi
  done < <(xcrun xctrace list devices 2>/dev/null | sed -n '/^== Devices ==$/,/^== /p' | head -20 || true)

  echo "No connected iPhone found. Plug in your phone, trust this Mac, then retry." >&2
  echo "Or: export COCONUT_DEVICE_UDID=00008140-001A28601E83801C" >&2
  exit 1
}

UDID="$(pick_device_udid)"
echo "Device: $UDID"
echo "Building com.coconut.app.dev (Tap to Pay enabled)…"
echo "Team: $TEAM_ID — approve any Xcode / Apple ID prompts."

BUILD_SETTINGS="$(
  xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration "$CONFIG" \
    -destination "id=$UDID" \
    -showBuildSettings 2>/dev/null
)"
TARGET_BUILD_DIR="$(echo "$BUILD_SETTINGS" | grep -m1 'TARGET_BUILD_DIR' | sed 's/^[[:space:]]*TARGET_BUILD_DIR = //')"
WRAPPER_NAME="$(echo "$BUILD_SETTINGS" | grep -m1 'WRAPPER_NAME' | sed 's/^[[:space:]]*WRAPPER_NAME = //')"
APP_PATH="$TARGET_BUILD_DIR/$WRAPPER_NAME"

echo "Running xcodebuild (provisioning updates enabled)…"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "id=$UDID" \
  "DEVELOPMENT_TEAM=$TEAM_ID" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build

if [[ ! -d "$APP_PATH" ]]; then
  echo "Build finished but app not found at: $APP_PATH" >&2
  exit 1
fi

echo "Installing $APP_PATH …"
EXPO_ARGS=(run:ios --device "$UDID" --binary "$APP_PATH")
if [[ "${1:-}" == "--install-only" ]]; then
  EXPO_ARGS+=(--no-bundler)
fi

npx expo "${EXPO_ARGS[@]}"
