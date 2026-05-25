#!/usr/bin/env bash
# Point Coconut Dev at Metro on 127.0.0.1 (simulator cannot use 192.0.0.x from Expo).
set -euo pipefail

BUNDLE_ID="${COCONUT_BUNDLE_ID:-com.coconut.app.dev}"
METRO_URL="${COCONUT_METRO_URL:-http://localhost:8081}"
DEV_URL="exp+coconut-app://expo-development-client/?url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$METRO_URL', safe=''))")"
UDID="${1:-}"

if [[ -z "$UDID" ]]; then
  UDID=$(xcrun simctl list devices booted -j | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtimes in data.get('devices', {}).values():
  for d in runtimes:
    if d.get('state') == 'Booted' and 'iPhone' in d.get('name', ''):
      print(d['udid'])
      break
  else:
    continue
  break
" 2>/dev/null || true)
fi

if [[ -z "$UDID" ]]; then
  echo "No booted iPhone simulator. Open Simulator.app and boot a device, then retry." >&2
  exit 1
fi

if ! curl -sf "${METRO_URL}/status" >/dev/null 2>&1; then
  echo "Metro is not running at $METRO_URL" >&2
  echo "In another terminal: npm run ios:dev:sim:metro" >&2
  exit 1
fi

echo "Launching $BUNDLE_ID on $UDID …"
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null || true
sleep 1.5
xcrun simctl openurl "$UDID" "$DEV_URL"
echo "Opened dev client → $METRO_URL"
