---
name: The spoke→shared primitive
description: The load-bearing structural pattern that recurs across every thread kind. The architecture is built on this. Future design moves should consciously test whether they preserve or violate it.
type: project
originSessionId: 169aeac2-f5fc-4f64-b417-4514ffb4fb25
---
Across all four thread kinds built day one, the same structural pattern repeated. This is the architecture, not a coincidence:

**The agent works in private spokes. The shared surface is its synthesis. Nothing moves from spoke to shared without the user's ratification.**

| Thread kind | The spoke | The shared synthesis |
|---|---|---|
| **Group (dinner)** | Each member's 1:1 with agent — availability, preferences, constraints | Final time/place/who's in |
| **Relationship (Anna)** | Private channel between you and your agent — context dumps, agent's notes | Outbound to contact (via email if off-app); intent ledger |
| **Partnership (Jenny scoped threads)** | Each party's private chat with the agent (Default thread acts as the catch-all spoke) | Routed ops cards in the right scoped thread |
| **Arbitration (Contractor)** | Vent / coaching dialogue between each party and the agent | Agent's framing messages on shared surface + per-party reactions |

**Why this matters:**

- It's the **trust mechanism**. Spokes contain unprocessed input (venting, half-formed thoughts, embarrassing requests). Shared contains only what each party has ratified. The agent literally cannot share spoke content without explicit consent.
- It's the **emotional safety mechanism**. iMessage forces every micro-frustration into the shared channel where it ricochets. Spoke→shared lets the agent absorb friction privately and surface only the resolved or coachable version.
- It's the **structural moat**. Any product attempting the same surface without per-party private agent channels collapses back into iMessage. The hub-and-spoke topology is the moat; spoke→shared is its operative pattern.

**Concrete rules that fall out:**

1. **The shared surface has no participant composer in some thread kinds.** Arbitration shared = read-only synthesis + reactions only. Tested and shipped.
2. **The agent NEVER quotes one party to the other from spoke content.** It paraphrases the ratified position; it does NOT surface raw venting.
3. **Privacy bands name the other party explicitly.** "Only you and the agent — Jenny doesn't see this." Trust is announced.
4. **Position ratification is a discrete moment.** The agent asks "Want me to share that as your position?" before anything moves to shared.

**Future design tests:**

- If a proposed feature would put participant raw content directly on the shared surface, it probably violates the pattern. Default no.
- If a proposed feature would let the agent paraphrase one party's words to the other without explicit ratification, it violates the pattern. Default no.
- New thread kinds inherit this pattern unless there's a structural reason not to. If you find yourself violating it, double-check the reason.
