---
name: In-flight design thought — fold resolved threads into summary
description: Pick this up on the next session. The founder flagged the briefing/list still feels busy and proposed that resolved threads disappear from the list and fold into summary data instead.
type: project
---

End of day-two session, the founder said:

> "It feels so busy right now — maybe resolved threads get hidden and turned into part of the summary data."

The context: the home screen briefing card now shows three live items (House, Decision with Jenny, Anna Chen). Below it in the conversation are several agent messages from earlier sessions. The thread list (via hamburger → All threads) shows everything — including threads that aren't actionable anymore.

**The design direction:** when a thread is *resolved* (intents ratified, decisions made, last activity old, no pending items for you), it shouldn't visually clutter the daily-use surface. It folds into a summary instead — a single line like "12 dormant connections" or "4 resolved this week" — that you can expand if you want, but normally don't see.

**Implications to think through next session:**

- What counts as "resolved"? No pending intents AND no activity in N days? Or explicit "done" state?
- Does the briefing card hide them entirely, or include a "dormant" row at the bottom?
- Does the threads list have a section/divider between active and resolved?
- Is this the same as the persistent-vs-ephemeral framing from yesterday? (Ephemeral threads probably resolve and fold faster.)
- The agent might surface a resolved thread back into view when something happens ("Anna Chen replied — back on your radar"), so resolution is reversible.

**Why this matters:** daily-use success criterion is "I keep opening this." A noisy home that shows you everything-ever is the failure mode. The agent's job is to surface what's live and quietly hold what's not.

This is the next thing to push on after restart.
