---
name: Commit and push cadence
description: When and how to commit and push during a session, so the founder can switch machines without losing context.
type: project
---

The founder works across multiple computers and wants origin/main to be within ~30 minutes of local at all times.

**Commit at the end of each meaningful chunk of work.** A chunk is roughly a feature: a flow, a primitive, a substantial refactor. Not every file edit; not every typecheck-clean state. The threshold is "would this be a coherent thing to read in a git log six months from now?"

**Push after every commit.** Don't accumulate local commits. The whole point of the cadence is the founder can `git pull` on the home machine and be current.

**Memory updates land in the same commit as the work that motivated them.** When we write down a new framing or insight in `.claude/memory/`, commit it alongside the code that surfaced it. Don't batch memory updates separately.

**Commit message style:**
- One-line summary in the subject, naming the user-visible outcome ("Conference scenario: QR scan...")
- Empty line, then a bullet list of what landed
- Co-author line for Claude

**Use git status to assess scope before committing.** Don't commit `.npm-cache` or other ignored stuff. The .gitignore covers it, but verify with `git status --short`.

**When the founder reminds about cadence, that's a signal we let it slip.** Default to commits more frequent than feels necessary; the cost of one extra commit is zero, the cost of losing context across machines is large.
