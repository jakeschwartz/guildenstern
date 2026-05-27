---
name: Day-one session arc
description: The order of work in the first session, the structural insights that emerged in sequence, and what was built. Helps future sessions pick up without re-deriving.
type: project
originSessionId: 169aeac2-f5fc-4f64-b417-4514ffb4fb25
---
Day one (2026-05-18) was a single long session that built four thread kinds in sequence and discovered architectural primitives in the process. The order matters because each kind exposed a problem the next one inherited and resolved.

**Sequence built:**

1. **Visual shell + group thread.** Started with the dinner-coordination scenario from SPEC.md. Established the editorial palette (paper/ink + agent green `#1C3F36` + attention ochre `#B8843A`). Built `PhoneFrame`, `ThreadList`, `GroupThread`, `MessageBubble`, `Composer`, `UserSwitcher`. Got the seeded "Dinner soon?" thread rendering at 393px before any agent logic.

2. **Spoke layer for group thread.** Added `Spoke.tsx` — each member's private 1:1 with the agent, scoped to a thread. Established the **spoke→shared** pattern that recurs everywhere.

3. **Relationship thread (1:1 networking — Anna Chen).** Sketched the Layer 2 use case: agent-mediated outbound to off-app contacts. Introduced **mutual intent ledger** as the structural primitive — itemized consent contracts (both ratify before agent acts). Built `RelationshipThread`, `IntentLedger`, `ChannelToggle` (Private with Agent / Outbound to contact), email-channel rendering for off-app participants.

4. **UX compression pass.** Chrome had bloated to ~540px on Anna's view. Introduced **`ThreadAnchor` + `LedgerPill` + `Sheet`** as the three-row chrome contract. Reduced chrome to ~190px. Bumped tap targets to ≥44px and caps labels to ≥12px. Stripped the band-based `AgentIndicator` to a single pill. **The three-row chrome grammar is now load-bearing across the whole app.**

5. **Partnership thread (Jake + Jenny logistics).** Introduced **per-party rendering**: same thread, Jake sees ops cards / Jenny sees conversation with agent acks. Built `PartnershipThread`, `OpsCard` primitive, and seeded Jenny's burst → agent structuring ack → ratification flow. Jake's view stubbed for "Phase 2."

6. **Partnership → multiple scoped threads.** The user's insight: a partnership isn't one thread, it's a *container* of many scoped threads (Default, Kids, House, etc.). Introduced the `Partnership` entity. Split Jenny's single thread into three. The thread list grew section headers grouping threads by partnership. The agent's structuring ack changed to show **routing across threads** ("Eli → Kids, contractor → House"). Cross-thread provenance preserved via `sourceMessageId`.

7. **Arbitration thread (Contractor A vs B).** A fourth thread kind for decisions. Introduced **Question / Position / Option / Decision** primitives. Initially built as if positions were inputs; user corrected ("you vent and the agent coaches you to a position") and again ("agent is 90% of the content, participants agree or not — think couples counseling"). Rebuilt: **shared surface has no composer**, only agent messages and inline **reaction strips** (Agreed / Not quite / Sitting with this). Added a **vent spoke** per party — private coaching dialogue with the agent that produces a ratified position. Built `ArbitrationThread`, `ArbitrationSpoke`, `ReactionStrip`.

**State as of end-of-day:**

- 4 thread kinds: `group`, `relationship`, `partnership`, `arbitration`
- The `Partnership` entity groups multiple scoped threads
- `OpsCard` carries operational tasks (in partnership scoped threads)
- `MutualIntent` carries 1:1 contractual agreements (in relationship threads)
- `ArbitrationOption` + `ArbitrationPosition` + `Reaction` carry decision-making (in arbitration threads)
- `Sheet` chrome holds reference detail across thread kinds
- Per-party view rendering works for partnership (Jenny full chat, Jake stub) and arbitration (per-party pill copy, per-party vent spoke content, per-party privacy band)
- localStorage key bumped to `guildenstern:v7`

**Things consciously not built day one (and why):**

- Claude API integration — orchestration without the LLM is just seed data theater; build the surface first.
- Decision ratification mechanics — needs Claude in the loop for the agent to react to user reactions.
- Real composer state (sending messages persists nothing) — punted; surface-first.
- Host hub view (Jake's read-only across all spokes in group thread) — separate design pass.
- The "Fights / processing" thread — collapsed into arbitration in this session (venting is the spoke; arbitration is the synthesis). May need a separate kind later if pure processing-without-decision needs its own surface.
- Ops card classifier — the routing in seed is hand-routed; the real agent has to do it post-Claude-API.
