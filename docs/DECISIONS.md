# Guildenstern — Working Decisions

Short list of things already decided. New Claude Code sessions should read this and not re-litigate.

---

## Strategic

- **Working name is Guildenstern.** Original Hamlet spelling. Not the production name — placeholder for the working phase. Don't waste cycles on naming until the prototype works.
- **The consent space and hub-and-spoke patterns are the core IP.** Every product decision should preserve them. If a simpler design breaks the hub-and-spoke topology, the simpler design is wrong.
- **The killer app long-term is work networking.** v1 prototype uses the friend-dinner scenario as a test case because the interaction model is identical and the founder can dogfood it.
- **Co-parenting is the parallel high-revenue bet held in reserve.** Not part of v1. Same architecture, different vertical.
- **Friend coordination, family logistics, and group consumer use cases are consequences of the wedge, not the wedge itself.** Don't lead with them in any positioning.

## Product

- **Mobile-first, always.** Design at 393px from day one. No desktop view in v1.
- **The agent is neutral for v1.** Represents the thread's coordination need, not any individual. The "your agent represents you" model comes in the work-networking phase.
- **The agent is a participant, not a tool.** It has agency in the thread. It can initiate, ping, synthesize, confirm. It is not summoned by @mention.
- **Visual distinctness matters.** Agent messages must look meaningfully different from human messages. The user must always know who is speaking.
- **Trust moments are non-negotiable.** Before the agent posts a synthesized output to the group, it confirms privately with the host. This is the structural feature that builds trust in the agent over time.

## Build

- **Web prototype first.** Not because it's the product but because iteration speed is brutal-fast in this environment and the interaction model dominates everything else.
- **React + Vite + TypeScript + Tailwind.** No additional framework. No backend. localStorage for session persistence.
- **The Claude API is the agent.** System prompt + thread history + spoke histories. One model call per agent message.
- **Multi-user simulated via a user switcher in the corner.** No real auth, no multi-device, no real notifications.
- **iPhone-width viewport from day one.** Chrome devtools mobile mode is the dev environment. Never slip into desktop mode.
- **Week 12 is the decision point** on whether to port to React Native + Expo. Not before.
- **No premature mobile-native work.** Push, contacts, haptics, native gestures — all of these are deferred until after the interaction model is locked.

## Scope

- **Out of scope for v1:** real auth, real push, real contact import, real outbound to non-users, iOS native, Android, settings, profile, multi-device sync, persistence beyond browser.
- **In scope for v1:** the single killer moment (agent ping → private response → fan back into group) demonstrated end-to-end in the friend-dinner scenario.
- **"Done" for v1** is when a design partner says "oh, I get it" within 90 seconds of using the prototype on a phone-width browser.

## Process

- **Founder is dogfooding.** Every interaction model decision should be testable in the founder's own life within a week.
- **Don't optimize for anyone but the founder + 5–10 design partners.** No premature generalization.
- **Throw away the first three versions of any UI flow.** The right answer emerges from use, not from planning.
- **Long thinking belongs in PROJECT.md and SPEC.md, not in code comments.** Keep the codebase clean of strategic reasoning.

## Style

- **Clean editorial aesthetic.** No AI-generic design slop. Hairline rules, mixed-weight typography, generous whitespace.
- **No emoji in the product UI** unless a design partner specifically asks. The product is a tool for adults.
- **Agent voice is competent and dry.** No exclamation points, no hedging, no "I'd be happy to help!" The agent is a discreet intermediary, not a chatbot.
