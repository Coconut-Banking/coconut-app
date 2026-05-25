#!/usr/bin/env bash
# Regenerate ios/ for App Store (com.coconut.app). Required before `eas build --profile production`
# because EAS reads the committed native bundle ID during Apple credential setup.
set -euo pipefail
cd "$(dirname "$0")/.."

export APP_VARIANT=production
export EAS_BUILD_PROFILE=production
export ENABLE_TAP_TO_PAY_IOS=true

echo "→ expo prebuild (production / com.coconut.app)…"
npx expo prebuild --platform ios --no-install

echo "✓ ios/ is configured for com.coconut.app. Run: eas build --profile production --platform ios"
