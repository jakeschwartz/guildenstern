---
name: Open design questions
description: Design questions deliberately unresolved as of end-of-day-one. Pick these up when adjacent work surfaces them, not preemptively.
type: project
originSessionId: 169aeac2-f5fc-4f64-b417-4514ffb4fb25
---
The session ended with the user fatiguing on decisions; he was clear that each use case needs more iteration. These are the questions specifically held open.

**Per use case:**

- **Group (dinner)**: spoke→shared works, but the *host hub view* (Jake reads all four spokes) isn't built. Needs design. Likely a different surface from the regular member spoke.
- **Relationship (Anna)**: the bootstrap flow isn't built. Two flavors discussed: in-person QR/NFC bump, email-intro ingest. Both terminate in the same thread shape but the entry UX is different. The intent ledger's "Propose draft" action for outbound messages is a stub.
- **Partnership (Jenny)**: the actual classifier (Jenny's burst → routed ops cards) is seeded by hand. The real agent must do it post-Claude-API. Re-file UX (when classifier is wrong, tap a card to move it) not built. **Cross-thread linking** between ops cards (the "$4,800 quoted, $5,200 budgeted" beat) is in the data structure mention but not on screen.
- **Arbitration (Contractor)**: decision ratification mechanic not built (no "ratify this option" path; no decision flowing back into operating agreement). Real agent coaching behavior is the post-Claude-API work; the seed dialogue is a placeholder for what we hope it sounds like.

**Cross-cutting:**

- **"Fights" / pure processing.** Day one collapsed venting into the arbitration spoke. Question still open: is there a thread kind where venting is the whole point and no decision is required? The user has not asked for this yet, but raised it during the arbitration design conversation. Watch for the moment when seeded vent content has no decision attached and feels like it wants its own surface.
- **The default / open thread inside a partnership.** Currently exists but does dual-duty: catch-all classifier-input AND human-to-human direct messages (the "❤️ miss you" exchange). These might want to split. Dual-mode composer (Direct / Logged) was sketched in conversation but not built.
- **Operating agreement primitive.** Discussed extensively for partnership but only stubbed in sheets. The "Kids — alternating M/W/F vs T/Th" structured rules aren't a first-class data type yet.
- **Decision-making mechanic in arbitration.** Options exist as data; reactions exist as data; decision field exists as nullable; but the path from "both agreed on option C" → recorded decision is not built.
- **Routing UX for the dual-mode composer.** Agent silently routes vs. asks vs. user picks — the user leans "silently route with one-tap re-file" but this isn't tested in code.
- **Reactions are seeded, not dynamic.** Tapping "Agreed" in the prototype does nothing. Wiring this up is the obvious next interactive move.

**Architectural questions:**

- The thread-list grouping currently only groups partnerships. Should relationship + group also get section headers when they have multiple threads? Decision was "yes when 2+ threads, progressive disclosure." Implemented only for partnership for now.
- Should the founder-user always be `jake` in seed, or should viewing-as default match the most-recently-active context? Currently always defaults to `jake`.
- The `Partnership` entity exists but no equivalent for *groups* (the 5-friend dinner crew). When the friend crew gets multiple threads, will need a similar entity. Note for future.
