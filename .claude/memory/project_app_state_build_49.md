---
name: app-state-build-49
description: What Guildenstern became in the June 2026 arc (build 49, shipped 2026-06-20). Memory went silent after May 27, so this fills the gap.
metadata:
  type: project
---

Memory stopped being updated on 2026-05-27, but ~105 commits landed after that, through build 49 on 2026-06-20. By then the localStorage web prototype had become a real app, and docs/DECISIONS.md ("no backend, no iOS, no push") was out of date:

- Capacitor iOS wrapper, shipped to TestFlight (internal testers: founder + Jenny).
- Supabase backend: auth, RPCs, edge functions (agent-respond, synthesize-spoke, send-push, announce-status, Google Calendar OAuth + fetch-google-events). Remote project ref `psthqrdqggqgekqbansb`.
- Partnership-first flow: Login → Onboarding → InvitePartner / JoinPartnership → ThreadList → PartnershipThread / PersonalThread / OpenSpoke.
- Two named agents: **Mira** (personal thread, plum) and **Otis** (partnership thread, green, passive scribe). Mira proposes a shared thread on request; Otis suggests a thread when a message is off-topic.
- iMessage parity: tapbacks, typing indicator, reply-to, photos, push.
- Last feature arc (2026-06-19): ops-card clarification. "?" asks the partner via Otis, `clarify_ops_card` RPC, auto-resolves on partner reply.

[[project_in_flight_resolved_fold]] predates all of this. Confirm with the founder that it still applies before acting on it.

**Why:** On 2026-11-09 a session had to rebuild all of this from git because memory ended in May.
**How to apply:** For current app shape, trust git log over the day-one memories. See [[release-pipeline]] for shipping builds.
