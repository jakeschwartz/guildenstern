# Home machine setup

Run these once on any new machine you want to develop Guildenstern from.

## Prerequisites

- macOS with Homebrew installed
- A Claude Code install
- Logged into the same GitHub account that owns the `guildenstern` repo

## Steps

```bash
# 1. Clone the repo into ~/guildenstern (path matters — see note below).
cd ~
git clone git@github.com:<your-github-username>/guildenstern.git
cd guildenstern

# 2. Install deps. node_modules and .npm-cache stay local.
npm install --cache "$PWD/.npm-cache"

# 3. Symlink Claude Code's memory location to the in-repo memory folder
#    so context syncs across machines via git.
mkdir -p ~/.claude/projects/-Users-jakeschwartz-guildenstern
ln -s "$PWD/.claude/memory" ~/.claude/projects/-Users-jakeschwartz-guildenstern/memory

# 4. Start the dev server.
npm run dev
```

Open <http://localhost:5173> in Chrome's mobile emulation set to iPhone 15 Pro (393px width).

## Note on the project path

Claude Code derives its memory directory name from the project's filesystem path. The directory `-Users-jakeschwartz-guildenstern` is encoded from `/Users/jakeschwartz/guildenstern`. **Keep the project at `~/guildenstern` on every machine** so the encoded path stays identical and the symlink keeps working.

If you put it somewhere else, the symlink target name needs to match whatever Claude Code derives. To check: open the project in Claude Code, send any message, and look at the path it reads memory from in the system prompt.

## Daily workflow

```bash
# Pull before starting work
git pull

# Develop, commit normally
git add <files>
git commit -m "..."

# Push when ready
git push
```

Memory files in `.claude/memory/` update across machines just like code does. If you and Claude add memory in a session, those edits live in the in-repo files (via the symlink), and commit/push them like any other change. The other machine gets them on the next `git pull`.

## Shipping TestFlight builds

Only needed on a machine you want to ship builds from. TestFlight builds expire 90 days after upload, so ship at least that often while dogfooding.

1. **Free up disk.** Xcode plus the iOS platform takes roughly 15–20 GB, and the App Store needs extra room while it installs. Aim for 40 GB free.
2. **Install Xcode 26+** from the App Store and open it once; that accepts the license and installs components. Then add your Apple ID under Xcode → Settings → Accounts. Automatic signing (team `RRX57XZ8N2`) uses that account to create this Mac's certificates.
3. **Create `.env.local`** (not in git). Copy it from the build machine, or write it fresh with two lines:
   - `VITE_SUPABASE_URL=https://psthqrdqggqgekqbansb.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=…`, from the Supabase dashboard under Project Settings → API Keys, or `supabase projects api-keys --project-ref psthqrdqggqgekqbansb` after `supabase login`.

   Optional: the App Store Connect API key. That's `APP_STORE_CONNECT_KEY_ID` and `APP_STORE_CONNECT_ISSUER_ID` in `.env.local`, plus `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`. Without it, Xcode uploads with your Apple ID instead. Apple only lets you download a `.p8` once; if it's lost, create a new key in App Store Connect → Users and Access → Integrations.
4. **Ship:**

   ```bash
   ./scripts/upload-testflight.sh
   ```

   It checks all of the above before touching the build number, then builds, archives and uploads. Export Compliance is answered in `Info.plist`, and the internal tester groups add new builds automatically. Commit and push the bumped `project.pbxproj` afterwards so the other machine doesn't reuse the number.

`scripts/xcode-env.sh` picks the newest Xcode 26+ in `/Applications`, `~/Applications` or `~/Downloads`; set `XCODE_APP=/path/to/Xcode.app` to override. If the archive fails with "iOS … is not installed", run `xcodebuild -downloadPlatform iOS`.

## What's gitignored

- `node_modules/`, `.npm-cache/`, `dist/`, `.vite/` — local build artifacts
- `.env`, `.env.local`, `*.local` — secrets (when we add the Claude API key, it lives in `.env.local`)
- `.DS_Store` — macOS noise

Everything else, including `.claude/launch.json` and `.claude/memory/`, is tracked.
