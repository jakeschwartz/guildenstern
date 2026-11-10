---
name: rundown-experiment
description: Mira's twice-daily rundown push (built 2026-11-10, build 53) is a live experiment to make opening Guildenstern a daily habit for Jenny. What's tested, where the data lives, how to read it.
metadata:
  type: project
---

Goal (the founder's words): drive enough daily opens that using the app becomes Jenny's habit. Target: Jenny opens the app 5 of 7 days within three weeks; then a rising share of opens that don't come from a push.

**What's built:**
- Rundown = Mira's pinned inbox row opened up (src/components/Rundown.tsx). Sections: Needs you (partner's questions + your list, check off in place), Today (Google Calendar), New from partner, Handled. Evening leads with wins and ends with "Anything for tomorrow?". With nothing to show it's one line ("All clear…").
- send-rundown edge function runs every 15 min (pg_cron 'send-rundowns'). At 8–10am / 8–10pm local it claims a row in rundown_runs, skips if the person opened the app in the last 2h or there's nothing to say, otherwise sends one push.
- Seven push variants (supabase/functions/send-rundown/compose.ts): count, question, list_item, new_from_partner, day (am), win (pm), invitation (pm, max 2/week, only push allowed on a quiet day). Picking: uniform random for the first 14 days of someone's rundowns, then the best smoothed open rate 80% of the time and another eligible variant 20%.
- Push tiers: buzz for partner's words, things landing on you, questions to you, rundowns. "Handled" / "got it" / agent chatter are passive (silent). No one is pushed about their own action.
- Menu → "Send me a test rundown" sends one now, logged as kind rundown_test (excluded from stats).

**Data:** push_log (kind, variant, slot, sent_at, opened_at = tapped), app_opens (every launch/foreground, throttled 10 min), rundown_runs (outcome per person/day/slot: sent / skipped_active / skipped_nothing, plus eligible candidates). A push "converted" if tapped or the app opened within 30 min.

**Defaults the founder didn't explicitly choose** (flag if results look off): 8am/8pm local; timezone falls back to America/New_York until the app reports one; Jake gets rundowns too; all seven variants on.

**Why:** He framed this as a PM problem: "we need to try everything to test what works." With one user (~14 pushes/week), readouts give direction, not proof. Ask Jenny too.
**How to apply:** Do weekly readouts from push_log + app_opens + rundown_runs by variant and slot. Change one thing at a time: content for weeks 1–3, then timing. Related: [[project_jenny_burst_use_case]], [[feedback_pm_engagement]].
