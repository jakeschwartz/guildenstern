---
name: Collaboration style
description: How to iterate with this user — design before code on UX questions, color carries state not identity, compress chrome aggressively, lean editorial.
type: feedback
originSessionId: 169aeac2-f5fc-4f64-b417-4514ffb4fb25
---
**Design before code when the conversation is UX.** When the user says "this is still UX" or asks "what do you think?", they want a structured proposal first — usually with a clear recommendation and a tradeoff — then build only after they sign off. Resist the urge to code on a verbal cue alone.

**Why:** Multiple times today the right move was to propose a sketch in text and wait for a one-word confirmation. Building speculatively wastes both our cycles and contaminates the design conversation with implementation details.

**How to apply:** Default to a tight written sketch for any UX decision; commit to code only after explicit confirmation ("yes", "great", "build it"). If a directive is ambiguous, ask one focused question.

---

**Color carries state and role, not identity.** Early in the build I proposed per-person identity colors. The user pushed back: color should encode agent-vs-human, must-respond-vs-ambient, and mode (where am I?), not who-said-what.

**Why:** The product's structural innovations (agent posture, attention urgency, mode boundaries) need visual carriers. If identity eats the color budget, state becomes invisible.

**How to apply:** Identity = monochrome initials. State = the limited palette (paper/ink neutral, agent green `#1C3F36`, attention ochre `#B8843A`). Reactions and pills are state-coded; bubbles and avatars are not.

---

**Compress chrome aggressively. The phone is small.** When the Anna Chen thread hit ~540px of chrome before any messages, he flagged density as load-bearing. The reduction (anchor + pill + sheet) restored ~520px of message area.

**Why:** Phone real estate is the binding constraint. Every persistent UI element is paid for in scroll. The product is unusable if the chrome wins.

**How to apply:** Three-row chrome contract: **anchor row (60px) + state pill row (44px) + content area + composer (70px).** Anything richer goes in a Sheet (slide-up). Tap targets ≥44px. Caps labels ≥12px. Don't introduce new chrome without budgeting against this.

---

**Editorial register, no AI slop.** Serif for content (Tiempos-ish/Georgia), Inter for chrome labels, hairline rules, generous whitespace, paper-and-ink palette. No emoji in product UI unless a design partner specifically asks. Agent voice is competent and dry — no exclamation points, no "I'd be happy to help."

**Why:** Taste is the moat. A 6,000-person incumbent cannot ship taste in this register; a focused team can. Visual register is a meaningful product surface, not decoration.

**How to apply:** When in doubt, hairline. When undecided about a label, mixed-weight typography (serif title + caps eyebrow). Never use a color where a weight contrast would work.
