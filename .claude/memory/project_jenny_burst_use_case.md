---
name: Jenny burst use case
description: The founder's personal pain point that drives the partnership / asymmetric-buffer design. This is THE use case the product has to nail for him to use it.
type: project
originSessionId: 169aeac2-f5fc-4f64-b417-4514ffb4fb25
---
The founder's lived experience, in his own words: *"Jenny texts me all sorts of questions, things to do, reminders, etc — but you either respond to them immediately or they get lost, and then I get yelled at later. The desire for a synchronous response when I'm on another call also sucks. So a layer in between — something that makes her feel like it's been registered, but then can be organized and delivered to me when I can deal with it — would be huge."*

**The structural reading of this:** Jenny wants acknowledgment. The founder wants async control. iMessage forces them to compete for the same channel. The agent is the **asynchronous double-buffer** between them:

- Jenny writes → agent immediately acks her with structured echo → she feels heard NOW
- Founder reads → structured ops cards arrive on his time → he deals when he can
- Resolution → agent reports back to Jenny → loop closes

The structured echo is non-negotiable. *"Got it — Eli pickup → Kids, contractor → House, diapers → House. Sound right?"* This is the felt magic. It tells Jenny the agent heard the specific things and is treating them as discrete items, not lumping them.

**Implications baked into the design:**

- **Per-party rendering of the same thread is mandatory.** Jenny sees conversation; founder sees structured queue. This is not a feature, it's the architecture.
- **The default/open thread inside the partnership is where Jenny's bursts land.** The classifier routes them out to scoped threads (Kids/House/etc.) and the agent's ack tells her where they went.
- **Direct messages must ride through unmediated.** When Jenny sends "❤️ miss you," it cannot become a task. The dual-mode composer (Direct / Logged) — sketched but not built — is the eventual mechanism. Agent should infer most of the time.
- **The "yelled at later" failure mode is the worst-case.** Anything that drops an item silently is catastrophic. Items must surface to the founder eventually even if the classifier is uncertain. Prefer noisy mis-routing over silent drop.

**When to invoke this:**

- Any time a design conversation about the partnership thread surfaces a UX question, check whether the answer would make Jenny feel heard / not-yelled-at and would let the founder triage on his own time.
- If a proposed feature optimizes for one of those goals at the expense of the other, flag it explicitly.
- This use case is the **dogfood test.** If the founder couldn't replace iMessage with Guildenstern for his Jenny coordination, the product isn't ready.
