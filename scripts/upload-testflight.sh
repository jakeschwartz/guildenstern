#!/bin/bash
# Full TestFlight build + upload pipeline.
#
# Bumps the build number, builds the web bundle, syncs iOS, archives,
# exports an App Store-signed .ipa, and uploads to App Store Connect via
# the API key in ~/.appstoreconnect/private_keys/.
#
# Reads the Supabase + App Store Connect settings from .env.local. The
# matching .p8 must live in ~/.appstoreconnect/private_keys/. Everything is
# checked before the build number is touched. See docs/SETUP.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

. "$ROOT/scripts/xcode-env.sh"

if [ ! -f .env.local ]; then
  echo "✗ .env.local missing. Copy it from the build machine (see docs/SETUP.md)."
  exit 1
fi
set -a
. ./.env.local
set +a

# Without the Supabase vars the bundle falls back to a localhost placeholder
# and the shipped app can't reach the backend.
for var in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_ISSUER_ID; do
  if [ -z "${!var:-}" ]; then
    echo "✗ $var missing from .env.local"
    exit 1
  fi
done

# TestFlight builds get production APNs tokens; a sandbox build never receives pushes.
if [ "${VITE_APNS_ENV:-production}" != "production" ]; then
  echo "✗ VITE_APNS_ENV=$VITE_APNS_ENV in .env.local; TestFlight needs production."
  exit 1
fi

P8="$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"
if [ ! -f "$P8" ]; then
  echo "✗ App Store Connect key not found at $P8"
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
xcodebuild \
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
xcodebuild \
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

echo "✓ Build $NEXT_BUILD uploaded."
echo "▶ Waiting for Apple processing then setting Export Compliance + tester groups…"
node "$ROOT/scripts/asc-post-upload.mjs" "$NEXT_BUILD"
