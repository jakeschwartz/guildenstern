// Pure-ish request handler for lock-screen card actions. The Deno.serve
// wrapper lives in index.ts; tests call handleCardAction with a mock db.

import { verifyCardActionToken } from "../_shared/card_action_token.ts";

export const MAX_ATTEMPTS_PER_10_MIN = 20;

export type CardActionName = "done" | "tomorrow" | "pass";

export type CardActionRequest = {
  token?: unknown;
  action?: unknown;
  push_id?: unknown;
  card_id?: unknown;
};

export type Db = {
  noteAttempt: (pushId: string | null) => Promise<number>;
  getPushLog: (pushId: string) => Promise<{ id: string; user_id: string; card_id: string | null } | null>;
  applyAction: (
    pushId: string,
    cardId: string,
    userId: string,
    action: CardActionName,
  ) => Promise<{ ok: true; idempotent: boolean; action: string; card_id: string }>;
};

export type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

const ACTIONS = new Set<CardActionName>(["done", "tomorrow", "pass"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function handleCardAction(
  input: CardActionRequest,
  deps: { secret: string; db: Db; nowSeconds?: number },
): Promise<HandlerResult> {
  const actionRaw = asString(input.action);
  const pushId = asString(input.push_id);
  const cardId = asString(input.card_id);
  const token = asString(input.token);

  const attemptKey = pushId && UUID_RE.test(pushId) ? pushId : null;
  const attempts = await deps.db.noteAttempt(attemptKey);
  if (attempts > MAX_ATTEMPTS_PER_10_MIN) {
    return { status: 429, body: { ok: false, error: "rate_limited" } };
  }

  if (!actionRaw || !ACTIONS.has(actionRaw as CardActionName) || !pushId || !cardId || !token) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }
  const action = actionRaw as CardActionName;

  const log = await deps.db.getPushLog(pushId);
  if (!log) return { status: 404, body: { ok: false, error: "not_found" } };
  if (log.card_id && log.card_id !== cardId) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  const verified = await verifyCardActionToken(
    deps.secret,
    token,
    { pushId, cardId, userId: log.user_id },
    deps.nowSeconds,
  );
  if (!verified.ok) {
    const status = verified.reason === "expired" ? 401 : 403;
    return { status, body: { ok: false, error: verified.reason } };
  }

  try {
    const result = await deps.db.applyAction(pushId, cardId, log.user_id, action);
    return { status: 200, body: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "not the owner" || message === "card is not open" || message === "card not found") {
      return { status: 409, body: { ok: false, error: message } };
    }
    if (message === "invalid action" || message === "no partner to pass to") {
      return { status: 400, body: { ok: false, error: message } };
    }
    console.error("[card-action] apply failed", message);
    return { status: 500, body: { ok: false, error: "internal" } };
  }
}
