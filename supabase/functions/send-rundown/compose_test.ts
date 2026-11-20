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
