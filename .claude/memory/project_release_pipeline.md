---
name: release-pipeline
description: How TestFlight builds ship. scripts/upload-testflight.sh needs Xcode 26+, an Apple ID in Xcode (or the ASC .p8), and .env.local. Builds expire after 90 days.
metadata:
  type: project
---

`scripts/upload-testflight.sh` runs the whole release: bumps CURRENT_PROJECT_VERSION, `npm run build`, `cap sync ios`, then archive + export with xcodebuild and upload.

What it needs outside git:
- Xcode 26+ with its license accepted. `scripts/xcode-env.sh` picks the newest Xcode installed. The original build machine also has an old Xcode 16.2 in /Applications, so "newest", not "first found", matters.
- `.env.local` with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Without them the bundle points at a localhost placeholder backend and the shipped app is broken. The publishable key is public, but get it from the dashboard or `supabase` CLI, not by searching local files.
- One way to authenticate the upload:
  - **API key:** APP_STORE_CONNECT_KEY_ID + APP_STORE_CONNECT_ISSUER_ID in `.env.local`, plus `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`. Uploads with altool, then `asc-post-upload.mjs`.
  - **Apple ID:** the founder's Apple ID in Xcode → Settings → Accounts. Export runs with `destination=upload`.

Export Compliance is answered in Info.plist (`ITSAppUsesNonExemptEncryption = NO`, added 2026-11-09). The internal tester groups auto-add builds. So the API-key path isn't required for testers to get a build.

The script checks the above before bumping the build number.

Builds 1–49 shipped from the founder's other machine using the API key. On 2026-11-09 the founder chose to make "Jake's MacBook Air" a second build machine. Xcode 27.2 is installed there; it has no .p8, so it uses the Apple ID path. Until the Xcode license is accepted, `/usr/bin/git` fails there too; `DEVELOPER_DIR=/Library/Developer/CommandLineTools git …` works around it.

TestFlight builds expire 90 days after upload. Build 49 (2026-06-20) expired around 2026-09-18, which is why the founder lost access to the app.

**Why:** Not knowing which machine could ship cost a session a lot of investigation.
**How to apply:** Before shipping, check the current machine against the list above. Related: [[app-state-build-49]].
