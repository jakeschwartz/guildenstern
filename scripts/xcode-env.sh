# Sourced by the iOS scripts. Picks the newest full Xcode on this machine and
# exports DEVELOPER_DIR, so every xcodebuild / xcrun call (altool, devicectl)
# uses it. Command Line Tools alone can't archive or upload, and App Store
# Connect rejects builds made with anything older than Xcode 26.
#
# Override with XCODE_APP=/path/to/Xcode.app.

MIN_XCODE_MAJOR=26

xcode_version() {
  /usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$1/Contents/Info.plist" 2>/dev/null || true
}

if [ -z "${XCODE_APP:-}" ]; then
  XCODE_APP=$(
    for app in /Applications/Xcode*.app "$HOME/Applications/Xcode"*.app "$HOME/Downloads/Xcode"*.app; do
      if [ -d "$app/Contents/Developer" ]; then
        echo "$(xcode_version "$app") $app"
      fi
    done | sort -V | tail -1 | cut -d' ' -f2-
  )
fi

if [ -z "$XCODE_APP" ] || [ ! -d "$XCODE_APP/Contents/Developer" ]; then
  echo "✗ No Xcode found. Install Xcode $MIN_XCODE_MAJOR+ from the App Store, or set XCODE_APP=/path/to/Xcode.app."
  exit 1
fi

XCODE_VERSION=$(xcode_version "$XCODE_APP")
if [ "${XCODE_VERSION%%.*}" -lt "$MIN_XCODE_MAJOR" ] 2>/dev/null || [ -z "$XCODE_VERSION" ]; then
  echo "✗ $XCODE_APP is Xcode ${XCODE_VERSION:-unknown}; need $MIN_XCODE_MAJOR+."
  exit 1
fi

export DEVELOPER_DIR="$XCODE_APP/Contents/Developer"
echo "▶ Using Xcode $XCODE_VERSION ($XCODE_APP)"
