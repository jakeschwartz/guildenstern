#!/bin/bash
# Full TestFlight build + upload pipeline.
#
# Bumps the build number, builds the web bundle, syncs iOS, archives,
# exports an App Store-signed .ipa, and uploads it to App Store Connect.
#
# Upload goes through the App Store Connect API key when its .p8 is in
# ~/.appstoreconnect/private_keys/ (key + issuer IDs in .env.local).
# Without it, Xcode uploads with the Apple ID in Xcode → Settings → Accounts.
# Either way Export Compliance comes from Info.plist and the internal tester
# groups pick the build up automatically.
#
# Everything is checked before the build number is touched. See docs/SETUP.md.
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
for var in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY; do
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

P8="$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID:-none}.p8"
if [ -n "${APP_STORE_CONNECT_KEY_ID:-}" ] && [ -n "${APP_STORE_CONNECT_ISSUER_ID:-}" ] && [ -f "$P8" ]; then
  UPLOAD_VIA=api
else
  UPLOAD_VIA=xcode
  echo "▶ No App Store Connect API key on this machine; Xcode will upload with your Apple ID."
fi

# Point at the fix for the signing errors we've actually hit.
explain_failure() {
  if grep -q "PLA Update available" "$1"; then
    echo "  Apple has an updated Program License Agreement. The Account Holder must accept it at"
    echo "  https://developer.apple.com/account; it can take a few minutes to reach Xcode."
  elif grep -qE "No Accounts|No account for team" "$1"; then
    echo "  Add your Apple ID in Xcode → Settings → Accounts."
  fi
}

# Bump CURRENT_PROJECT_VERSION
CURRENT_BUILD=$(grep -E "CURRENT_PROJECT_VERSION = [0-9]+" ios/App/App.xcodeproj/project.pbxproj | head -1 | sed -E 's/.*CURRENT_PROJECT_VERSION = ([0-9]+).*/\1/')
NEXT_BUILD=$((CURRENT_BUILD + 1))
echo "▶ Bumping build $CURRENT_BUILD → $NEXT_BUILD"
sed -i '' "s/CURRENT_PROJECT_VERSION = $CURRENT_BUILD;/CURRENT_PROJECT_VERSION = $NEXT_BUILD;/g" ios/App/App.xcodeproj/project.pbxproj

# Any failure before the upload lands puts the build number back.
UPLOADED=0
restore_build() {
  if [ "$UPLOADED" != 1 ]; then
    sed -i '' "s/CURRENT_PROJECT_VERSION = $NEXT_BUILD;/CURRENT_PROJECT_VERSION = $CURRENT_BUILD;/g" ios/App/App.xcodeproj/project.pbxproj
    echo "  Nothing was uploaded; build number put back to $CURRENT_BUILD."
  fi
}
trap restore_build EXIT

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
  explain_failure /tmp/guildenstern-archive.log
  exit 1
}

# With destination=upload, the export step also uploads, using the Xcode account.
EXPORT_OPTIONS=ios/ExportOptions.plist
if [ "$UPLOAD_VIA" = xcode ]; then
  cp ios/ExportOptions.plist build/ExportOptions-upload.plist
  /usr/libexec/PlistBuddy -c "Set :destination upload" build/ExportOptions-upload.plist
  EXPORT_OPTIONS=build/ExportOptions-upload.plist
  echo "▶ Exporting + uploading via Xcode…"
else
  echo "▶ Exporting App Store .ipa…"
fi
xcodebuild \
  -exportArchive \
  -archivePath build/App.xcarchive \
  -exportPath build/AppStoreIPA \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates > /tmp/guildenstern-export.log 2>&1 || {
  echo "✗ Export failed. Last 30 lines:"
  tail -30 /tmp/guildenstern-export.log
  explain_failure /tmp/guildenstern-export.log
  exit 1
}

if [ "$UPLOAD_VIA" = xcode ]; then
  UPLOADED=1
  echo "✓ Build $NEXT_BUILD uploaded. Internal testers get it once Apple finishes processing (usually 5–30 min)."
  exit 0
fi

echo "▶ Uploading to App Store Connect…"
xcrun altool --upload-app \
  -f build/AppStoreIPA/App.ipa \
  -t ios \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
UPLOADED=1

echo "✓ Build $NEXT_BUILD uploaded."
echo "▶ Waiting for Apple processing then setting Export Compliance + tester groups…"
node "$ROOT/scripts/asc-post-upload.mjs" "$NEXT_BUILD"
