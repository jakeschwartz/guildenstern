# Guildenstern

*Working name. A conversation management paradigm for the age of agents.*

---

## The thesis

Computing has always evolved through its interface — punch card, text line, GUI, mobile, voice, natural language. Each shift expanded what computing could do.

LLM excitement has overweighted two use cases: logic creation and human expression. The real exponentials throughout computing history have been the other two: human communication and human coordination.

Chat is now the dominant LLM interface. Taken seriously, that points somewhere specific: the messages inbox itself becomes the substrate, threads become the unit, agents move into them.

## The primitive

**Each thread is a consent space.** Not a conversation — a scoped, revocable permission boundary. A defined context where specific people and specific agents are allowed to act. Different agents in different threads. Different humans in different threads. Every permission revocable at any moment.

**The agent operates in a different topology than the conversation.** Group chats are flat — everyone sees everything. Agents inside threads can fan out privately to each member (the "spokes"), gather, synthesize, and fan back into the shared view (the "hub"). The thread stays clean. The coordination happens underneath.

This hub-and-spoke pattern is the structural innovation. It is not possible inside iMessage, WhatsApp, Slack, ChatGPT/Claude shared projects, or Gmail — each is structurally constrained from shipping it.

## Why now / why the incumbents haven't done it

The "obvious" prediction two years ago was that WhatsApp or ChatGPT would ship this in six months. They haven't. Each tried adjacent versions (shared projects, Slack AI) and the attempts don't work — because the attempts ride on the wrong primitive (single-user contexts, flat group chats, discrete email envelopes). The experiments have been run. The shape is wrong, not the technology.

## The killer app: work networking

The market is already conditioned to pay for relationship infrastructure. Hub-and-spoke is uniquely suited to it. The user installs for themselves before anyone else is involved.

- Single-player value from session one
- Asymmetric viral export — your agent reaches out; recipients don't need the app
- Professional willingness to pay
- Founder-dogfoodable

Three layers, each a product:

1. **Relationship memory.** Every contact is a persistent thread between you and the agent. Voice notes, context, follow-ups, what you said you'd send.
2. **Agent-mediated introductions.** Your agent reaches out on your behalf. Schedules, contextualizes, synthesizes. Each intro pulls a new user toward the product without requiring an install.
3. **Full hub-and-spoke.** Deal threads, board threads, hiring loops, founder peer groups, eventually friend coordination and co-parenting.

## Why this wedge and not group coordination

Group products have a brutal acquisition problem: value is in the group, install is by the individual. Evite, GroupMe, Cocoon, Path, Houseparty — all hit this wall. The networking wedge inverts it: single-player utility first, asymmetric multi-party export second. Same pattern as Calendly, Superhuman, Loom.

Friend coordination, co-parenting, and the rest follow. They are consequences of the wedge, not the wedge itself.

## The moat is the UX

Anyone can describe hub-and-spoke. Almost nobody can make it feel right on a six-inch screen, one-handed, half-distracted. The hard problems:

1. Where am I right now — group view vs. private spoke
2. The transition between modes
3. Notification voice and batching
4. Who is talking — agent for itself, agent for me, agent for the group
5. What does the agent know
6. Async coordination that feels like progress, not delay
7. Mobile-first, thumb-only, two seconds of attention

A 6,000-person incumbent cannot ship taste in this register. A focused team can.

## Build plan

- Web prototype, iPhone-width viewport (393px), Claude Code
- Single killer moment: agent ping → private response → fan back into group
- 5–10 design partners from founder's network
- No App Store, no Android, no marketing
- Week 12 decision point: port to React Native + Expo with the interaction model locked

The web phase is not the product. It is a specification for the iOS app, built in the medium that lets us iterate fastest.
