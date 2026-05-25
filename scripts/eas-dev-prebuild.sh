#!/usr/bin/env bash
# Restore ios/ for local Coconut Dev (com.coconut.app.dev) after a production prebuild.
set -euo pipefail
cd "$(dirname "$0")/.."

export APP_VARIANT=dev
export ENABLE_TAP_TO_PAY_IOS=true

echo "→ expo prebuild (dev / com.coconut.app.dev)…"
npx expo prebuild --platform ios --no-install

echo "✓ ios/ is configured for com.coconut.app.dev"
