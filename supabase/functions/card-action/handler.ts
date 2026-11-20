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

export type PushLogRow = { id: string; user_id: string; card_id: string | null };

export type Db = {
  // null means the limiter itself failed. Callers must fail closed.
  noteAttempt: (pushId: string | null) => Promise<number | null>;
  getPushLog: (pushId: string) => Promise<PushLogRow | null>;
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
  if (attempts === null) {
    return { status: 503, body: { ok: false, error: "unavailable" } };
  }
  if (attempts > MAX_ATTEMPTS_PER_10_MIN) {
    return { status: 429, body: { ok: false, error: "rate_limited" } };
  }

  if (
    !actionRaw || !ACTIONS.has(actionRaw as CardActionName) || !pushId || !cardId || !token ||
    !UUID_RE.test(pushId) || !UUID_RE.test(cardId)
  ) {
    return { status: 400, body: { ok: false, error: "invalid_request" } };
  }
  const action = actionRaw as CardActionName;

  let log: PushLogRow | null;
  try {
    log = await deps.db.getPushLog(pushId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "push_log_unavailable") {
      return { status: 503, body: { ok: false, error: "unavailable" } };
    }
    throw e;
  }
  if (!log) return { status: 404, body: { ok: false, error: "not_found" } };
  // The push row is the binding. A null card_id is not an actionable push,
  // and a different card_id is not this push. Compare case-insensitively;
  // the MAC is checked against the stored ids, which are what was signed.
  if (!log.card_id || log.card_id.toLowerCase() !== cardId.toLowerCase()) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }
  if (log.id.toLowerCase() !== pushId.toLowerCase()) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  const verified = await verifyCardActionToken(
    deps.secret,
    token,
    { pushId: log.id, cardId: log.card_id, userId: log.user_id },
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
    const message = (e instanceof Error ? e.message : String(e)).trim().split("\n")[0] ?? "";
    if (message === "not the owner" || message === "card is not open" || message === "card not found") {
      return { status: 409, body: { ok: false, error: message } };
    }
    if (message === "forbidden") {
      return { status: 403, body: { ok: false, error: "forbidden" } };
    }
    if (message === "invalid action" || message === "no partner to pass to") {
      return { status: 400, body: { ok: false, error: message } };
    }
    console.error("[card-action] apply failed", message);
    return { status: 500, body: { ok: false, error: "internal" } };
  }
}
