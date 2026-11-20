import { handleCardAction, MAX_ATTEMPTS_PER_10_MIN, type Db } from "./handler.ts";
import { signCardActionToken } from "../_shared/card_action_token.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SECRET = "test-placeholder-secret-not-for-production";
const PUSH = "11111111-1111-4111-8111-111111111111";
const CARD = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const NOW = 1_700_000_000;

type ApplyCall = { pushId: string; cardId: string; userId: string; action: string };

function mockDb(opts: {
  attempts?: number;
  missingLog?: boolean;
  logCardId?: string | null;
  logUserId?: string;
  apply?: (call: ApplyCall) => Promise<{ ok: true; idempotent: boolean; action: string; card_id: string }>;
}): Db & { applies: ApplyCall[] } {
  const applies: ApplyCall[] = [];
  const db: Db & { applies: ApplyCall[] } = {
    applies,
    noteAttempt: () => Promise.resolve(opts.attempts ?? 1),
    getPushLog: (pushId: string) => {
      if (opts.missingLog) return Promise.resolve(null);
      return Promise.resolve({
        id: pushId,
        user_id: opts.logUserId ?? USER,
        card_id: opts.logCardId === undefined ? CARD : opts.logCardId,
      });
    },
    applyAction: async (pushId, cardId, userId, action) => {
      const call = { pushId, cardId, userId, action };
      applies.push(call);
      if (opts.apply) return await opts.apply(call);
      return { ok: true, idempotent: applies.length > 1, action, card_id: cardId };
    },
  };
  return db;
}

async function token(extra = {}) {
  return await signCardActionToken(SECRET, { pushId: PUSH, cardId: CARD, userId: USER, ...extra }, NOW);
}

Deno.test("handleCardAction applies a valid Done once", async () => {
  const db = mockDb({});
  const result = await handleCardAction(
    { token: await token(), action: "done", push_id: PUSH, card_id: CARD },
    { secret: SECRET, db, nowSeconds: NOW },
  );
  assertEquals(result.status, 200);
  assertEquals(result.body.ok, true);
  assertEquals(result.body.idempotent, false);
  assertEquals(db.applies.length, 1);
  assertEquals(db.applies[0]?.action, "done");
  assertEquals(db.applies[0]?.userId, USER);
});

Deno.test("handleCardAction is idempotent per push_id+action", async () => {
  let calls = 0;
  const db = mockDb({
    apply: async (call) => {
      calls += 1;
      return { ok: true, idempotent: calls > 1, action: call.action, card_id: call.cardId };
    },
  });
  const body = { token: await token(), action: "tomorrow" as const, push_id: PUSH, card_id: CARD };
  const first = await handleCardAction(body, { secret: SECRET, db, nowSeconds: NOW });
  const second = await handleCardAction(body, { secret: SECRET, db, nowSeconds: NOW });
  assertEquals(first.body.idempotent, false);
  assertEquals(second.body.idempotent, true);
  assertEquals(second.status, 200);
  assertEquals(db.applies.length, 2);
  assertEquals(db.applies[0]?.action, "tomorrow");
  assertEquals(db.applies[1]?.action, "tomorrow");
});

Deno.test("handleCardAction rate-limits before verifying the token", async () => {
  const db = mockDb({ attempts: MAX_ATTEMPTS_PER_10_MIN + 1 });
  const result = await handleCardAction(
    { token: "tampered", action: "done", push_id: PUSH, card_id: CARD },
    { secret: SECRET, db, nowSeconds: NOW },
  );
  assertEquals(result.status, 429);
  assertEquals(db.applies.length, 0);
});

Deno.test("handleCardAction rejects an expired token without applying", async () => {
  const db = mockDb({});
  const t = await token({ exp: NOW + 10 });
  const result = await handleCardAction(
    { token: t, action: "pass", push_id: PUSH, card_id: CARD },
    { secret: SECRET, db, nowSeconds: NOW + 11 },
  );
  assertEquals(result.status, 401);
  assertEquals(result.body.error, "expired");
  assertEquals(db.applies.length, 0);
});

Deno.test("handleCardAction rejects a card id that does not match the push", async () => {
  const db = mockDb({ logCardId: CARD });
  const otherCard = "44444444-4444-4444-8444-444444444444";
  const t = await signCardActionToken(
    SECRET,
    { pushId: PUSH, cardId: otherCard, userId: USER },
    NOW,
  );
  const result = await handleCardAction(
    { token: t, action: "done", push_id: PUSH, card_id: otherCard },
    { secret: SECRET, db, nowSeconds: NOW },
  );
  assertEquals(result.status, 403);
  assertEquals(db.applies.length, 0);
});

Deno.test("handleCardAction surfaces owner and open-card conflicts", async () => {
  const db = mockDb({
    apply: () => Promise.reject(new Error("not the owner")),
  });
  const result = await handleCardAction(
    { token: await token(), action: "done", push_id: PUSH, card_id: CARD },
    { secret: SECRET, db, nowSeconds: NOW },
  );
  assertEquals(result.status, 409);
  assertEquals(result.body.error, "not the owner");
});

Deno.test("handleCardAction rejects a missing push or malformed body", async () => {
  const db = mockDb({ missingLog: true });
  const missing = await handleCardAction(
    { token: await token(), action: "done", push_id: PUSH, card_id: CARD },
    { secret: SECRET, db, nowSeconds: NOW },
  );
  assertEquals(missing.status, 404);
  const bad = await handleCardAction(
    { token: await token(), action: "snooze", push_id: PUSH, card_id: CARD },
    { secret: SECRET, db, nowSeconds: NOW },
  );
  assertEquals(bad.status, 400);
});
