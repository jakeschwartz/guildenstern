import {
  parseCardActionToken,
  signCardActionToken,
  TOKEN_TTL_SECONDS,
  verifyCardActionToken,
} from "./card_action_token.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SECRET = "test-placeholder-secret-not-for-production";
const OTHER = "other-placeholder-secret";
const ids = {
  pushId: "11111111-1111-4111-8111-111111111111",
  cardId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
};

Deno.test("sign and verify a fresh token", async () => {
  const now = 1_700_000_000;
  const token = await signCardActionToken(SECRET, ids, now);
  const parsed = parseCardActionToken(token);
  assert(parsed);
  assertEquals(parsed.exp, now + TOKEN_TTL_SECONDS);
  const result = await verifyCardActionToken(SECRET, token, ids, now);
  assertEquals(result.ok, true);
});

Deno.test("verify rejects an expired token", async () => {
  const now = 1_700_000_000;
  const token = await signCardActionToken(SECRET, { ...ids, exp: now + 10 }, now);
  const result = await verifyCardActionToken(SECRET, token, ids, now + 11);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "expired");
});

Deno.test("verify rejects a token still inside the 72h window at the last second, and expires after", async () => {
  const now = 1_700_000_000;
  const token = await signCardActionToken(SECRET, ids, now);
  const lastTick = await verifyCardActionToken(SECRET, token, ids, now + TOKEN_TTL_SECONDS);
  assertEquals(lastTick.ok, true);
  const after = await verifyCardActionToken(SECRET, token, ids, now + TOKEN_TTL_SECONDS + 1);
  assertEquals(after.ok, false);
  if (!after.ok) assertEquals(after.reason, "expired");
});

Deno.test("verify rejects a wrong secret, card, user, or push id", async () => {
  const now = 1_700_000_000;
  const token = await signCardActionToken(SECRET, ids, now);
  const wrongSecret = await verifyCardActionToken(OTHER, token, ids, now);
  assertEquals(wrongSecret.ok, false);
  const wrongCard = await verifyCardActionToken(
    SECRET,
    token,
    { ...ids, cardId: "44444444-4444-4444-8444-444444444444" },
    now,
  );
  assertEquals(wrongCard.ok, false);
  const wrongUser = await verifyCardActionToken(
    SECRET,
    token,
    { ...ids, userId: "55555555-5555-4555-8555-555555555555" },
    now,
  );
  assertEquals(wrongUser.ok, false);
  const wrongPush = await verifyCardActionToken(
    SECRET,
    token,
    { ...ids, pushId: "66666666-6666-4666-8666-666666666666" },
    now,
  );
  assertEquals(wrongPush.ok, false);
});

Deno.test("verify rejects a tampered exp or malformed token", async () => {
  const now = 1_700_000_000;
  const token = await signCardActionToken(SECRET, ids, now);
  const parts = token.split(".");
  const tampered = `${parts[0]}.${Number(parts[1]) + 86_400}.${parts[2]}`;
  const result = await verifyCardActionToken(SECRET, tampered, ids, now);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "mismatch");
  assertEquals((await verifyCardActionToken(SECRET, "not-a-token", ids, now)).ok, false);
  assertEquals((await verifyCardActionToken(SECRET, "", ids, now)).ok, false);
});

Deno.test("a bad signature with a past exp is mismatch, not expired", async () => {
  const now = 1_700_000_000;
  const token = await signCardActionToken(SECRET, ids, now);
  const parts = token.split(".");
  const forged = `${parts[0]}.${now - 10}.${parts[2]}`;
  const result = await verifyCardActionToken(SECRET, forged, ids, now);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "mismatch");
  const truncated = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, 8)}`;
  const short = await verifyCardActionToken(SECRET, truncated, ids, now);
  assertEquals(short.ok, false);
  if (!short.ok) assertEquals(short.reason, "mismatch");
});
