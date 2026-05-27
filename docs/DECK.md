# Guildenstern — Deck v1 (plain text)

The thirteen slides of the working deck, in plain text. This is the cleanest summary of the thesis. Reference for future sessions.

---

## 1. Title

**Guildenstern** *[working name]*

A conversation management paradigm for the age of agents.

— Working draft. Jake Schwartz.

---

## 2. Interface evolution

Computing has always evolved through its interface.

Punch card → Text line → GUI → Mobile → Voice → Natural language

Each shift expanded what computing could do by changing how humans engage with it.

---

## 3. LLM excitement, narrowly framed

LLM excitement has emphasized two use cases.

1. Logic creation — *emphasized*
2. Human expression — *emphasized*
3. Human communication
4. Human coordination

These are the obvious ones. They are not the biggest ones.

---

## 4. The real exponentials

The real exponentials have always been the other two.

1. Logic creation
2. Human expression
3. Human communication — *the exponential*
4. Human coordination — *the exponential*

Every major platform of the last thirty years won by reshaping how humans talk to and organize with each other — not by making individuals more productive.

---

## 5. The messages inbox

The logical UI implication of chat is the messages inbox.

Chat is the dominant LLM interface. Taken seriously, that points somewhere specific.

i. The inbox itself becomes the substrate.
ii. Threads become the unit.
iii. Agents move into them.

---

## 6. Consent spaces

Each thread is a *consent space*.

A thread is not a conversation. It is a scoped, revocable permission boundary — a defined context where specific people and specific agents are allowed to act.

- Different agents in different threads.
- Different humans in different threads.
- Every permission revocable at any moment.

Examples: Co-parenting logistics. Q4 board prep. Friday songwriting circle. Aging parent care.

---

## 7. Hub and spoke

The agent operates in a different topology than the conversation.

Group chats are flat — everyone sees everything. Agents inside threads can fan out privately to each member (spokes), gather, synthesize, and fan back into the shared view (hub).

The thread stays clean. The coordination happens underneath.

Structurally not possible in any existing messaging product.

---

## 8. Incumbents have tried

The incumbents have tried. The attempts don't work.

**ChatGPT & Claude Projects.** Both shipped shared projects. They are document-and-context containers with multiple users attached — not threads, not consent spaces, not hub-and-spoke. The agent is a tool the group uses, not a participant in the group. Adoption is thin; usage is mostly single-player even when sharing is enabled.

**Slack.** Shipped Slack AI and a growing agent surface. Works as enterprise search and summarization; does not work as a participant in coordination. And it is locked inside the work context.

**iMessage & WhatsApp.** Haven't tried, and structurally can't. Their product is the absence of features. Adding agents to threads breaks the social contract that the thread is private between humans.

**Gmail.** Wrong metaphor. Email is discrete envelopes, not ongoing consent spaces. Smart Compose and Gemini summaries do not change the shape of the container.

*The experiments have been run. The shape is wrong, not the technology.*

---

## 9. The killer app

The killer app is *work networking*.

The market is already conditioned to pay for relationship infrastructure. The hub-and-spoke pattern is uniquely suited to it. The user can install for themselves before anyone else is involved.

- Single-player value from session one.
- Asymmetric viral export — your agent reaches out; the recipient does not need the app.
- Professional willingness to pay.
- Founder dogfoodable.

---

## 10. Three layers

Three layers. Each a product.

**I. Relationship memory.** Single-player. Immediate value. Every contact is a persistent thread between you and the agent. Voice notes, context, follow-ups, what you said you'd send. A personal relationship operating system.

**II. Agent-mediated introductions.** Where viral kicks in. Your agent reaches out on your behalf. Schedules, contextualizes, synthesizes. Each intro pulls a new user toward the product without requiring an install.

**III. Full hub-and-spoke.** The native multi-party shape. Deal threads, board threads, hiring loops, founder peer groups. Multi-party, agent-mediated, consent-scoped — across professional and personal life.

---

## 11. Why this wedge

Why this wedge and not group coordination.

**Group products:** value is in the group, install is by the individual. Evite, GroupMe, Cocoon, Path, Houseparty — all hit the same wall.

**This wedge:** single-player utility first, asymmetric multi-party export second. Same pattern as Calendly, Superhuman, Loom.

Friend coordination, co-parenting, and the rest follow. They are consequences of the wedge, not the wedge itself.

---

## 12. The UX is the moat

Anyone can describe hub-and-spoke. Almost nobody can make it feel right on a six-inch screen, one-handed, half-distracted.

The hard problems:

1. Where am I right now — group view vs. private spoke.
2. The transition between modes.
3. Notification voice and batching.
4. Who is talking — agent for itself, agent for me, agent for the group.
5. What does the agent know.
6. Async coordination that feels like progress, not delay.
7. Mobile-first, thumb-only, two seconds of attention.

A 6,000-person incumbent cannot ship taste in this register. A focused team can.

---

## 13. First 90 days

1. Web prototype, iPhone-width viewport, Claude Code.
2. Single killer moment: agent ping → private response → fan back into group.
3. Five to ten design partners from founder's network.
4. No App Store, no Android, no marketing.
5. Week 12 decision point: port to React Native + Expo with the interaction model locked.

*The web phase is not the product. It is a specification for the iOS app, built in the medium that lets us iterate fastest.*
