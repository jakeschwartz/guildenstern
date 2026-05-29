# Guildenstern — UX Decisions, v4

Hand-off doc for Claude Code. This captures the architecture and design
decisions reached in the Lovable session on 2026-05-28. It is meant to be
specific enough to implement against and opinionated enough to push back on.

The live sketch is in this Lovable project's `src/routes/index.tsx`. Use it
as the visual reference; this doc is the written grammar behind it.

---

## 0. The frame

iMessage as the substrate. The home screen is a messages list. Each thread
is a room. The composer is at the bottom. We inherit that grammar — we are
not inventing a new threads-list metaphor.

The two qualifiers doing all the work are **clearly coded** (the agent is
visibly not-a-person) and **consent from both parties** (the agent never
appears asymmetrically; every agent action is visible to everyone in the
room; anything the agent puts on the record can be challenged on the
record).

---

## 1. The two-character model

**Mira** — yours. Private 1:1 agent. Pinned at the top of the messages
list. Knows your queue, your calendar, your half-formed thoughts. **Mira
never appears in a thread with other people.**

**Otis** — the social one. A contact who shows up in group threads where
he is a participant. Scribe by default, mediator when asked. Announces
posture shifts in language before doing anything more interventionist
(e.g. *"Stepping into mediator mode for a second — wave me off if you'd
rather just hash it out."*).

The split *is* the privacy model:
- If it's in a room with other people → it's Otis.
- If it's just you → it's Mira.

Both names are defaults. Customizable in v2.

### Why split

If a single agent was "the mediator in the group chat" AND "the thing that
knows my therapy notes," that's too much trust loaded onto one character.
Split means the private one can be more intimate and the social one can be
more performative without surveillance dread.

---

## 2. Spokes are the edge case

The original architecture treated "private spoke off a shared thread" as
the default mental model. We're flipping it: **most threads stay flat
forever.** Group chat is just a group chat. Otis is in the room as scribe.

Spokes still exist, but only when the situation actually asks for one
(votes, bets, sensitive nudges, structurally-asymmetric partnership work
like Jenny/Jake). When Otis spins one up he names *why* in the same
sentence, and the fact that a spoke is open is visible in the parent
thread as a coded line.

Design rule: **Otis spins up a side channel because he has to, not because
he can.** If we let spokes proliferate, the app collapses back into a
privacy-gradient mental model and we lose the iMessage feel.

---

## 3. Specialists / plugins

There is one agent from the user's POV: theirs (Mira) and the social one
(Otis). Specialists are not pickable from a store. Otis notices a
wagerable / bookable / trip-plannable pattern, offers to bring in a
specialist, the room consents, the specialist joins.

Specialists **speak in their own voice** (e.g. *Marlowe · bookie ·
specialist*) on a third visual stock (cool gray-blue) so a brief outside
voice reads as outside without stealing the room. **One specialist in the
room at a time.** Otis introduces, Otis closes out. Specialist dormants
after the job (settles bet, posts itinerary, etc.).

Consent rule: specialists ride on the consent already given to Otis. User
never sees an app store.

---

## 4. Consent rules (load-bearing)

1. **Every agent action is visible to everyone in the room.** If Otis
   back-channels a group member, the *fact* of the back-channel shows up
   in the group thread as a coded line. The contents stay private; the
   existence does not.
2. **The agent never appears asymmetrically.** In a 1:1 between two
   humans, Otis appears only if both sides have opted him in. Mira is
   yours and stays yours — she is never in a room with another human.
3. **Anything the agent puts on the record can be challenged on the
   record.** When Otis synthesizes someone's position, that person has a
   one-tap "that's not what I meant" affordance visible to the other
   parties. The agent's authority is provisional.

These three rules are most of the product.

---

## 5. Visual grammar

### Palette
- **Paper / ink** — main canvas + text. Dark mode is default (deep neutral
  charcoal, hue 270). Toggle exists; light mode is a warm editorial cream.
  Persists in `localStorage` under `guildenstern-theme`.
- **Otis green** (`oklch(~.78 .13 165)` dark, `oklch(.42 .07 165)` light)
  — structural only: left margin rule, badge, name. Never on the message
  text itself.
- **Mira plum** (`oklch(~.76 .13 320)` dark, `oklch(.42 .08 320)` light)
  — same rule. Structural only. Mira's tint background uses a separate,
  greyer token (`--mira-tint`) so the pinned row reads as *yours* without
  bathing the inbox in purple.
- **Specialist blue-gray** (`oklch(~.74 .1 240)`) — third stock so outside
  voices read as outside, briefly.
- **Other-human warm tint** — same ink, different paper. Differentiator
  is substrate, not text color.
- **Attention orange** — pending-for-you dot. Used sparingly.

All tokens live in `lightPalette` / `darkPalette` at the top of
`src/routes/index.tsx`. Use CSS custom properties throughout — never
hardcode colors in component styles.

### Type
- Phone interiors: `ui-sans-serif, -apple-system, BlinkMacSystemFont,
  "Helvetica Neue", Helvetica, Arial, sans-serif`. Reads as a real phone
  app, not a manifesto.
- Deck / article copy outside the phones: serif (`ui-serif, "Iowan Old
  Style", "Apple Garamond", Georgia, serif`). The phones are the
  substrate; the deck is the argument.

### Inbox styling (intentional step off iMessage)
- Title is "Threads," not "Messages."
- `Filter · New` affordances instead of Edit / ⊕.
- Squircle avatars (radius 10) instead of perfect circles.
- No `›` chevron on rows.
- Mira's row is pinned, tinted, and shows a plum dot + `PINNED` label.

---

## 6. Coded agent messages

Agent messages are visibly not-a-person. They are not bubbles.
- Left margin rule in the agent's color.
- Small caps name + ` · ` role + state dot (e.g. *"Otis · scribe"*,
  *"Mira · concierge"*, *"Otis · mediator (offered)"*, *"Otis ·
  specialist in room"*).
- Posture shifts appear *in language* in the first line of the message
  ("Stepping into mediator mode for a second…"), italicized.
- Routed items (Mira sorting a partnership burst into shared queues) use a
  `RoutedRow` with a `↻` re-file affordance.

The discipline: a user should be able to scroll a thread and sort *human
says* from *agent says* before reading a word.

---

## 7. The seven canonical scenes

These are the scenes currently in the prototype. They double as the
acceptance set for any redesign — anything you change should be defensible
across all seven.

| # | Scene | What it proves |
| - | --- | --- |
| 01 | **Inbox** | Mira pinned at top with plum rail; Otis only appears inside the group threads where he's a participant. Split is visible at a glance. |
| 02 | **Your 1:1 with Mira** | Same chrome as any contact thread. Mira's "concierge" voice with a `RoutedRow` queue. You answer in plain language. |
| 03 | **Group · default** | Flat thread, Otis as scribe in the room, no spokes. The case most threads stay in forever. |
| 04 | **Posture shift** | Otis announces *"Stepping into mediator mode…"* in language before doing anything more interventionist. Consent stays legible. |
| 05 | **Spoke · edge case** | Side channel opened only because the situation asks. Otis names why. Tinted canvas signals private. |
| 06 | **Specialist** | Marlowe (bookie) joins in his own voice on the blue-gray stock. Otis stays in the room. Specialist closes out and dormants. |
| 07 | **Partnership routing** | Mira sorts Jenny's burst into shared household queues (Kids / House). `↻` re-files. Affordance for *you-in-the-watching* without anyone watching. |

---

## 8. Open questions (worth arguing before building)

1. **Posture pill.** The earlier sketch (v1/v2) used a chrome posture pill
   as the load-bearing UI element. v3/v4 retired it in favor of in-line
   coded messages because the iMessage frame already answers "which room
   am I in." If you bring it back, it has to do work the chrome doesn't
   already do — e.g. cross-thread agent state when the agent is working
   for you in *another* room.
2. **Per-party rendering.** The Jake-sees-a-queue vs. Jenny-sees-a-chat
   asymmetry. Current sketch shows Mira's queue for Jake's side; we have
   not built Jenny's-side render of the same thread. That's the next slice.
3. **Quiet fold.** Still want it, but derive it from agent state (no
   pending-for-you, no agent working a spoke, no awaiting ratification)
   rather than a 7-day timeout. See spec at
   `/mnt/documents/guildenstern-resolved-fold-spec.md` for the older
   timeout-based version.
4. **Notification voice.** Always Mira when it's for you alone; Otis when
   the message originates in a shared room. No mixed batches. Push copy
   should sound like the agent summarizing, not like the system relaying.
5. **Bringing Otis into a 1:1 between two humans.** The consent moment.
   Both sides must opt in, and the opt-in must be visible in the thread.
   Not designed yet.

---

## 9. What changed from the original deck

This list is what to communicate to anyone who has only read `DECK.md`:

- The agent has names now: **Mira** (private) and **Otis** (social). Two
  characters, not one.
- **Spokes are the edge case**, not the default. Most threads are flat.
- **Specialists** ride on Otis's consent. The user never picks from a
  store.
- **Posture shifts** are announced in language, not in chrome.
- **iMessage is the substrate**, but the inbox steps off it (Threads /
  Filter · New / squircle avatars / no chevron) so it doesn't feel like
  a clone.
- **Dark mode is default**, toggle exists; phones go dark, deck stays
  paper.

---

## 10. File map (in this Lovable project)

- `src/routes/index.tsx` — the entire sketch. Single file by design. Contains
  palette tokens, `Phone`, `Scenario`, `ListRow`, `InboxHeader`,
  `MiraVoice`, `OtisVoice`, `SpecialistVoice`, `RoutedRow`, `ThemeToggle`,
  and all seven scenes inline.
- `.lovable/plan.md` — earlier first-pass plan, including the older
  resolved-fold pickup (now superseded — see open question #3).

If you want to port this back into the Guildenstern Vite/Tailwind v3
repo, the only structural primitive that needs to travel is the palette
token system + the three voice components (Mira / Otis / Specialist) +
the `RoutedRow`. Everything else is composition.
