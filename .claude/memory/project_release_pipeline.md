---
name: release-pipeline
description: How TestFlight builds ship. scripts/upload-testflight.sh only runs on the machine with Xcode + secrets (not the MacBook Air). Builds expire after 90 days.
metadata:
  type: project
---

`scripts/upload-testflight.sh` runs the whole release: bumps CURRENT_PROJECT_VERSION, `npm run build`, `cap sync ios`, archive + export with xcodebuild, upload with altool, then `asc-post-upload.mjs` sets export compliance and assigns the internal tester groups.

It needs three things that live outside git:
- Xcode 26+, with the founder's Apple ID added in Xcode → Settings → Accounts (automatic signing). `scripts/xcode-env.sh` picks the newest Xcode installed. The original build machine also has an old Xcode 16.2 in /Applications, so "newest", not "first found", matters.
- `.env.local` (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID)
- `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`

The script checks all three before bumping the build number. A build made without the Supabase vars points at a localhost placeholder backend, so the app it produces is broken.

Builds 1–49 shipped from the founder's other machine. On 2026-11-09 the founder chose to set up "Jake's MacBook Air" as a second build machine. It started with only Command Line Tools and 17 GB free disk, so they had to free space, install Xcode and copy the two secrets over. Setup steps are in docs/SETUP.md.

TestFlight builds expire 90 days after upload. Build 49 (2026-06-20) expired around 2026-09-18, which is why the founder lost access to the app.

**Why:** Not knowing which machine could ship cost a session a lot of investigation.
**How to apply:** Before trying to ship, check that the current machine has Xcode, `.env.local` and the .p8. If any is missing, have the founder run the script on the build machine. Related: [[app-state-build-49]].
