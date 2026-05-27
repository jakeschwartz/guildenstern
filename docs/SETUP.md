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

## What's gitignored

- `node_modules/`, `.npm-cache/`, `dist/`, `.vite/` — local build artifacts
- `.env`, `.env.local`, `*.local` — secrets (when we add the Claude API key, it lives in `.env.local`)
- `.DS_Store` — macOS noise

Everything else, including `.claude/launch.json` and `.claude/memory/`, is tracked.
