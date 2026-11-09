#!/bin/bash
# Build the web app + iOS shell, install to the connected iPhone, launch.
# Runs entirely from the terminal — no Xcode UI needed.
#
# Requires:
# - Xcode 26+ (scripts/xcode-env.sh picks the newest one installed)
# - Phone unlocked when the install step runs
set -euo pipefail

DEVICE_ID=508F2313-0E3A-5F7E-8D2D-8FD73692BA01
BUNDLE_ID=com.jakeschwartz.guildenstern
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

. "$ROOT/scripts/xcode-env.sh"

echo "▶ Building web bundle…"
npm run build

echo "▶ Syncing to iOS shell…"
npx cap sync ios

echo "▶ Building iOS Debug for device…"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "generic/platform=iOS" \
  -derivedDataPath build \
  -allowProvisioningUpdates \
  build > /tmp/guildenstern-xcb.log 2>&1 || {
  echo "✗ xcodebuild failed. Last 30 lines:"
  tail -30 /tmp/guildenstern-xcb.log
  exit 1
}

echo "▶ Installing on device (phone must be unlocked)…"
xcrun devicectl device install app \
  --device "$DEVICE_ID" \
  build/Build/Products/Debug-iphoneos/App.app

echo "▶ Launching…"
xcrun devicectl device process launch \
  --device "$DEVICE_ID" \
  "$BUNDLE_ID"

echo "✓ Done"
