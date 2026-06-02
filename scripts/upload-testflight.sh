#!/bin/bash
# Full TestFlight build + upload pipeline.
#
# Bumps the build number, builds the web bundle, syncs iOS, archives,
# exports an App Store-signed .ipa, and uploads to App Store Connect via
# the API key in ~/.appstoreconnect/private_keys/.
#
# Reads APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID from
# .env.local. The matching .p8 must live in ~/.appstoreconnect/private_keys/.
set -euo pipefail

XCODE_DIR=/Users/jakeschwartz/Downloads/Xcode.app/Contents/Developer
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load API creds
set -a
. .env.local
set +a

if [ -z "${APP_STORE_CONNECT_KEY_ID:-}" ] || [ -z "${APP_STORE_CONNECT_ISSUER_ID:-}" ]; then
  echo "✗ APP_STORE_CONNECT_KEY_ID / APP_STORE_CONNECT_ISSUER_ID missing from .env.local"
  exit 1
fi

# Bump CURRENT_PROJECT_VERSION
CURRENT_BUILD=$(grep -E "CURRENT_PROJECT_VERSION = [0-9]+" ios/App/App.xcodeproj/project.pbxproj | head -1 | sed -E 's/.*CURRENT_PROJECT_VERSION = ([0-9]+).*/\1/')
NEXT_BUILD=$((CURRENT_BUILD + 1))
echo "▶ Bumping build $CURRENT_BUILD → $NEXT_BUILD"
sed -i '' "s/CURRENT_PROJECT_VERSION = $CURRENT_BUILD;/CURRENT_PROJECT_VERSION = $NEXT_BUILD;/g" ios/App/App.xcodeproj/project.pbxproj

echo "▶ Building web bundle…"
npm run build > /dev/null

echo "▶ Syncing iOS…"
npx cap sync ios > /dev/null

rm -rf build/App.xcarchive build/AppStoreIPA

echo "▶ Archiving (Release)…"
DEVELOPER_DIR="$XCODE_DIR" xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath build/App.xcarchive \
  -allowProvisioningUpdates \
  archive > /tmp/guildenstern-archive.log 2>&1 || {
  echo "✗ Archive failed. Last 30 lines:"
  tail -30 /tmp/guildenstern-archive.log
  exit 1
}

echo "▶ Exporting App Store .ipa…"
DEVELOPER_DIR="$XCODE_DIR" xcodebuild \
  -exportArchive \
  -archivePath build/App.xcarchive \
  -exportPath build/AppStoreIPA \
  -exportOptionsPlist ios/ExportOptions.plist \
  -allowProvisioningUpdates > /tmp/guildenstern-export.log 2>&1 || {
  echo "✗ Export failed. Last 30 lines:"
  tail -30 /tmp/guildenstern-export.log
  exit 1
}

echo "▶ Uploading to App Store Connect…"
xcrun altool --upload-app \
  -f build/AppStoreIPA/App.ipa \
  -t ios \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

echo "✓ Build $NEXT_BUILD uploaded. Apple processes for ~10-15 min before it's visible in TestFlight."
