import {
  type Candidate,
  pickCandidate,
  pickFixed,
  pickRundown,
  variantModeFromEnv,
} from "./compose.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const count: Candidate = { variant: "count", body: "Morning. One thing is on your list today.", threadId: null };
const listItem: Candidate = { variant: "list_item", body: "Still on your list: Diapers.", threadId: null };
const invitation: Candidate = {
  variant: "invitation",
  body: "Anything for tomorrow?",
  threadId: "11111111-1111-1111-1111-111111111111",
};
const question: Candidate = {
  variant: "question",
  body: "Jenny asked about “plumber”.",
  threadId: "11111111-1111-1111-1111-111111111111",
};

Deno.test("variantModeFromEnv defaults to fixed, including typos and empty", () => {
  assertEquals(variantModeFromEnv(undefined), "fixed");
  assertEquals(variantModeFromEnv(null), "fixed");
  assertEquals(variantModeFromEnv(""), "fixed");
  assertEquals(variantModeFromEnv("fixed"), "fixed");
  assertEquals(variantModeFromEnv("FIXED"), "fixed");
  assertEquals(variantModeFromEnv("bandit"), "bandit");
});

Deno.test("pickFixed prefers count, then list_item, else null", () => {
  assertEquals(pickFixed([invitation, listItem, count, question])?.variant, "count");
  assertEquals(pickFixed([invitation, listItem, question])?.variant, "list_item");
  assertEquals(pickFixed([invitation, question]), null);
  assertEquals(pickFixed([]), null);
});

Deno.test("pickRundown in fixed mode skips invitation-only candidates", () => {
  const pick = pickRundown([invitation], [], [], Date.now(), "fixed");
  assertEquals(pick, null);
});

Deno.test("pickRundown in fixed mode returns count even if history would favor another", () => {
  const history = [
    { variant: "count", sentAt: 1, openedAt: null },
    { variant: "count", sentAt: 2, openedAt: null },
    { variant: "list_item", sentAt: 3, openedAt: 4 },
  ];
  const pick = pickRundown([count, listItem], history, [], 1_000_000, "fixed");
  assertEquals(pick?.candidate.variant, "count");
  assertEquals(pick?.mode, "fixed");
});

Deno.test("pickRundown in bandit mode still uses the old picker", () => {
  // After the 14-day explore window, a 100% converting list_item beats a 0% count.
  const start = 0;
  const now = 15 * 24 * 60 * 60 * 1000;
  const history = [
    { variant: "count", sentAt: start, openedAt: null },
    { variant: "count", sentAt: start + 1, openedAt: null },
    { variant: "list_item", sentAt: start + 2, openedAt: start + 3 },
    { variant: "list_item", sentAt: start + 4, openedAt: start + 5 },
  ];
  // rng always >= EXPLORE_SHARE (0.2) so we take the best arm, not explore_other.
  const pick = pickRundown([count, listItem], history, [], now, "bandit", () => 0.99);
  assertEquals(pick?.candidate.variant, "list_item");
  assertEquals(pick?.mode, "best");
});

Deno.test("pickCandidate is unchanged: explores when there is no history", () => {
  const pick = pickCandidate([count, listItem], [], [], Date.now(), () => 0);
  assertEquals(pick?.mode, "explore");
  assertEquals(pick?.candidate.variant, "count");
});

import {
  actionableBody,
  armForLocalDate,
  type CardFact,
  localISODate,
  pickActionableCard,
} from "./compose.ts";

function card(partial: Partial<CardFact> & { id: string; createdAt: number }): CardFact {
  return {
    threadId: "11111111-1111-4111-8111-111111111111",
    title: "Call the contractor",
    ownerId: "owner-1",
    sourceUserId: "partner-1",
    status: "pending",
    doneAt: null,
    snoozedUntil: null,
    clarification: null,
    ...partial,
  };
}

Deno.test("armForLocalDate uses civil epoch-day parity, not day-of-month", () => {
  // 2026-01-31 and 2026-02-01 are consecutive calendar days; day-of-month
  // would be odd then odd, but epoch-day parity flips.
  const jan31 = armForLocalDate("2026-01-31");
  const feb01 = armForLocalDate("2026-02-01");
  assertEquals(jan31 !== feb01, true);
  assertEquals(armForLocalDate("1970-01-01"), "count"); // epoch day 0, even
  assertEquals(armForLocalDate("1970-01-02"), "actionable");
});

Deno.test("localISODate is DST-safe around the 2026 US transitions", () => {
  // 2026-03-08 02:00 America/New_York springs forward. Midnight and 23:30
  // on that civil date must stay on 2026-03-08.
  const nySpringMidnight = Date.parse("2026-03-08T05:00:00Z"); // 00:00 EDT? actually EST (UTC-5) before the jump
  // 00:00 EST = 05:00Z, still before the 07:00Z spring-forward.
  assertEquals(localISODate(nySpringMidnight, "America/New_York"), "2026-03-08");
  const nySpringEvening = Date.parse("2026-03-08T23:30:00-04:00");
  assertEquals(localISODate(nySpringEvening, "America/New_York"), "2026-03-08");
  const nyNext = Date.parse("2026-03-09T00:30:00-04:00");
  assertEquals(localISODate(nyNext, "America/New_York"), "2026-03-09");

  // 2026-11-01 02:00 America/New_York falls back. Late evening stays on the 1st.
  const nyFall = Date.parse("2026-11-01T23:30:00-05:00");
  assertEquals(localISODate(nyFall, "America/New_York"), "2026-11-01");
  const nyFallNext = Date.parse("2026-11-02T00:30:00-05:00");
  assertEquals(localISODate(nyFallNext, "America/New_York"), "2026-11-02");

  // A single instant can be different civil days in PT vs ET.
  const latePT = Date.parse("2026-11-20T23:30:00-08:00");
  assertEquals(localISODate(latePT, "America/Los_Angeles"), "2026-11-20");
  assertEquals(localISODate(latePT, "America/New_York"), "2026-11-21");
  assertEquals(armForLocalDate(localISODate(latePT, "America/Los_Angeles"))
    !== armForLocalDate(localISODate(latePT, "America/New_York")), true);
});

Deno.test("pickActionableCard takes the oldest unsnoozed partner request", () => {
  const now = Date.parse("2026-11-20T17:00:00Z");
  const older = card({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: now - 5 * 86_400_000,
    title: "Older ask",
  });
  const newer = card({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    createdAt: now - 1 * 86_400_000,
    title: "Newer ask",
  });
  const snoozed = card({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    createdAt: now - 10 * 86_400_000,
    title: "Snoozed ask",
    snoozedUntil: now + 3_600_000,
  });
  const mine = card({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    createdAt: now - 20 * 86_400_000,
    sourceUserId: "owner-1",
    title: "I asked myself",
  });
  const done = card({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    createdAt: now - 8 * 86_400_000,
    status: "done",
    title: "Already done",
  });
  const picked = pickActionableCard([newer, snoozed, mine, done, older], "owner-1", "partner-1", now);
  assertEquals(picked?.id, older.id);
});

Deno.test("pickActionableCard ignores a snooze that has already expired", () => {
  const now = Date.parse("2026-11-20T17:00:00Z");
  const expired = card({
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    createdAt: now - 2 * 86_400_000,
    snoozedUntil: now - 1,
  });
  const picked = pickActionableCard([expired], "owner-1", "partner-1", now);
  assertEquals(picked?.id, expired.id);
});

Deno.test("pickActionableCard returns null without a partner or an open card", () => {
  const now = 1_000;
  const onlyMine = card({ id: "00000000-0000-4000-8000-000000000001", createdAt: 1, sourceUserId: "owner-1" });
  assertEquals(pickActionableCard([onlyMine], "owner-1", "partner-1", now), null);
  assertEquals(pickActionableCard([onlyMine], "owner-1", null, now), null);
});

Deno.test("actionableBody formats partner, title, and age", () => {
  const now = Date.parse("2026-11-20T17:00:00Z");
  const c0 = card({ id: "00000000-0000-4000-8000-000000000002", createdAt: now - 3_600_000, title: "Diapers." });
  assertEquals(actionableBody("Jenny", c0, now), "Jenny asked: Diapers (0 days)");
  const c1 = card({ id: "00000000-0000-4000-8000-000000000003", createdAt: now - 86_400_000, title: "Plumber" });
  assertEquals(actionableBody("Jenny", c1, now), "Jenny asked: Plumber (1 day)");
  const c5 = card({ id: "00000000-0000-4000-8000-000000000004", createdAt: now - 5 * 86_400_000, title: "Call the contractor" });
  assertEquals(actionableBody("Jenny", c5, now), "Jenny asked: Call the contractor (5 days)");
});
