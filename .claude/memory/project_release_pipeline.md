---
name: release-pipeline
description: How TestFlight builds ship. scripts/upload-testflight.sh only runs on the machine with Xcode + secrets (not the MacBook Air). Builds expire after 90 days.
metadata:
  type: project
---

`scripts/upload-testflight.sh` runs the whole release: bumps CURRENT_PROJECT_VERSION, `npm run build`, `cap sync ios`, archive + export with xcodebuild, upload with altool, then `asc-post-upload.mjs` sets export compliance and assigns the internal tester groups.

It needs three things that live outside git:
- full Xcode at `~/Downloads/Xcode.app` (path is hard-coded in the script)
- `.env.local` (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID)
- `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`

As of 2026-11-09, "Jake's MacBook Air" has none of these (Command Line Tools only). Builds 1–49 shipped from the founder's other machine. A build made without `.env.local` points at a localhost placeholder backend, so the app it produces is broken.

TestFlight builds expire 90 days after upload. Build 49 (2026-06-20) expired around 2026-09-18, which is why the founder lost access to the app.

**Why:** Not knowing which machine could ship cost a session a lot of investigation.
**How to apply:** Before trying to ship, check that the current machine has Xcode, `.env.local` and the .p8. If any is missing, have the founder run the script on the build machine. Related: [[app-state-build-49]].
