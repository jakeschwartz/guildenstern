# Guildenstern v1 — Prototype Spec

This document defines what we are building in the first ~4 weeks. Read PROJECT.md first for thesis context.

---

## The single moment we're prototyping

> A group of friends is trying to schedule dinner. One person kicks it off in a thread. The agent takes over — pinging each member privately to gather availability, preferences, and constraints. The group sees only the synthesized result: a confirmed time, place, and who's in.

This is the *killer moment*. If we can make this single transition feel inevitable — the agent fanning out, then fanning back in — we have the kernel of the company. Everything else is built around making this moment work.

We are intentionally using the friend-dinner scenario as the test case even though work networking is the strategic wedge. The friend version is simpler to prototype, easier to test with the founder's own life, and the underlying interaction model is identical.

## Out of scope for v1

We are explicitly *not* building:

- Real authentication (use a name field + localStorage)
- Real push notifications (use in-app banners + polling)
- Real contact import (use a hard-coded list of mock contacts)
- Real SMS/email to non-users (show what the message *would* look like in a side panel)
- iOS native anything
- Android
- Account creation flow
- Settings, profile editing, preferences
- Any persistence beyond browser session
- Multi-device sync

If anyone asks "shouldn't we also build X" — the answer for v1 is almost always no. The goal is to lock the interaction model, not to ship a product.

## User scenarios (in priority order)

### Scenario 1 — The host kicks off

Jake (host) opens the app. Sees his thread list. Creates a new thread called "Dinner soon?" Adds four members: Adam, John, Matt, Sarah. Types: *"We should get dinner sometime in the next two weeks. Agent, can you handle it?"*

The agent acknowledges in the thread: *"On it. I'll reach out to everyone privately and get back to you with options."*

The agent then opens private spoke conversations with each member. From Jake's view, he can swipe/tap to see each spoke ("Agent ↔ Adam", "Agent ↔ John", etc.) — but he sees them as *the host*, not as a participant in those spokes. The host can observe but not interfere.

### Scenario 2 — A member responds in their spoke

Sarah opens her spoke with the agent. The agent has asked: *"Jake's trying to plan dinner with you, Adam, John, and Matt in the next two weeks. What works for you? Any preferences on neighborhood, cuisine, or vibe?"*

Sarah responds in natural language: *"I'm out of town next week but free the week after. Pretty open on food, prefer Brooklyn."*

The agent acknowledges and tells her it'll come back when it has a plan.

### Scenario 3 — The agent synthesizes back to the group

Once all spokes have responded, the agent posts to the group thread: *"Here's what I've got. Everyone's free Thursday the 23rd or Friday the 24th. Brooklyn works for the group. Three options: [restaurant A], [restaurant B], [restaurant C]. Going to lock in Thursday at 7:30 at [restaurant A] unless someone objects in the next hour."*

The group sees this single message. They do not see the private spoke conversations.

### Scenario 4 — Someone wants to change something

Adam, in the group thread, says: *"Thursday is bad for me actually."* The agent responds in the thread: *"Got it. Let me check with the others."* Reopens spokes as needed.

## Interaction model — key affordances

**Thread list view.** A list of threads. Each thread has a title and the most recent message. Standard messaging UI. iPhone-width.

**Group thread view.** The shared, public conversation. Messages from humans, messages from the agent (visually distinct). At the top of the thread, a small indicator: "Agent is active in this thread." Tap that indicator to access the *spoke layer*.

**The spoke layer.** From any group thread, the user can access *their own* 1:1 spoke with the agent for that thread. This is the most important UI question to get right. Initial proposal: a swipe-down gesture from the group thread reveals the user's private spoke. Or a persistent tab at the bottom that toggles "group / private". Try both. The right answer will emerge from use.

**The host's hub view.** The host (thread creator) gets an additional view: the ability to see *all* spokes in read-only mode. This is the moment users will most easily understand the architecture. The hub view should feel like a chief-of-staff dashboard.

**Agent visual language.** Agent messages are visually distinct from human messages. Different bubble style, different name treatment. Agent should never feel like "just another participant." When the agent is speaking *on behalf of* someone (e.g., relaying that Sarah is out of town next week), make that attribution clear.

**Confirmation moments.** Before the agent posts back to the group with a synthesized result, it should privately confirm with the host: *"I'm about to tell the group that Thursday at 7:30 at [restaurant A] works. Sound good?"* This is the trust moment.

## Tech stack

- **Frontend.** React + Vite. TypeScript. No framework beyond that. Tailwind for styling.
- **Viewport.** Design at 393px width (iPhone 15 Pro). Use Chrome devtools mobile mode for all development. Do not slip into desktop mode.
- **State.** In-memory React state, persisted to localStorage for session continuity. No backend, no database.
- **Agent.** Direct calls to the Claude API. The agent is a system prompt + the thread history + the spoke histories. One model call per agent message.
- **Multi-user simulation.** A user switcher in the corner — click to switch between "viewing as Jake / Adam / Sarah / etc." This lets the founder simulate the multi-party experience without needing real users on real devices.

## What "done" looks like for v1

Done is when the founder can demo Scenario 1 → 2 → 3 → 4 to a design partner, end to end, on a phone-width browser window, and the design partner says *"oh, I get it"* in the first 90 seconds. Not "oh, that's interesting" — *"oh, I get it."*

If the design partner asks a question that reveals they don't understand the architecture, the prototype needs more work on the UI of the spoke layer, not more features.

## Open questions for the build

These are not blockers. Pick a direction, ship, iterate.

1. **Spoke access UX.** Swipe down? Persistent tab? Long-press? Try one, see how it feels.
2. **Agent name/avatar.** Does the agent have a name? Just "Agent"? A generic icon? Lean minimal for v1.
3. **How does the agent decide when to post back to the group?** Threshold heuristic (all spokes responded) or time-bound or both. Start with "all spokes responded" for simplicity.
4. **Whose agent is it?** For v1, the agent is *neutral* — it represents the thread's coordination need, not any individual's interests. The "your agent represents you" model comes later, when we move into work networking.
