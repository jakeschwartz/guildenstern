// HMAC token bound to one push, one card, and one user, for lock-screen
// actions that have no session JWT. Format: v1.{exp}.{base64url(sig)}
// where sig is HMAC-SHA256 of "v1\\n{pushId}\\n{cardId}\\n{userId}\\n{exp}".

export const TOKEN_TTL_SECONDS = 72 * 60 * 60;
export const TOKEN_VERSION = "v1";

export type TokenFields = {
  pushId: string;
  cardId: string;
  userId: string;
  exp: number;
};

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64UrlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function payload(fields: TokenFields): string {
  return `${TOKEN_VERSION}\n${fields.pushId}\n${fields.cardId}\n${fields.userId}\n${fields.exp}`;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

const HMAC_LEN = 32;

// Always walks HMAC_LEN bytes. A short or long signature is a mismatch, folded
// into the same accumulator so the compare does not return early on length.
function timingSafeEqual(expected: Uint8Array, given: Uint8Array): boolean {
  let diff = (expected.length === HMAC_LEN ? 0 : 1) | (given.length === HMAC_LEN ? 0 : 1);
  for (let i = 0; i < HMAC_LEN; i++) {
    diff |= (expected[i] ?? 0) ^ (given[i] ?? 0);
  }
  return diff === 0;
}

export async function signCardActionToken(
  secret: string,
  fields: Omit<TokenFields, "exp"> & { exp?: number },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (!secret) throw new Error("CARD_ACTION_SECRET missing");
  const exp = fields.exp ?? nowSeconds + TOKEN_TTL_SECONDS;
  const full: TokenFields = { ...fields, exp };
  const sig = await hmac(secret, payload(full));
  return `${TOKEN_VERSION}.${exp}.${bytesToB64Url(sig)}`;
}

export type VerifyResult =
  | { ok: true; fields: TokenFields }
  | { ok: false; reason: "malformed" | "expired" | "mismatch" };

export function parseCardActionToken(token: string): { exp: number; sig: string } | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp <= 0) return null;
  // HMAC-SHA256 base64url is 43 chars. Cap well above that so a huge segment
  // cannot dominate verify time.
  if (!parts[2] || parts[2].length > 128) return null;
  return { exp, sig: parts[2] };
}

export async function verifyCardActionToken(
  secret: string,
  token: string,
  expected: Omit<TokenFields, "exp">,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!secret) return { ok: false, reason: "mismatch" };
  const parsed = parseCardActionToken(token);
  if (!parsed) return { ok: false, reason: "malformed" };
  // Authenticate before trusting exp. A forged token with a past exp is a
  // mismatch, not an expired token.
  const fields: TokenFields = { ...expected, exp: parsed.exp };
  const expectedSig = await hmac(secret, payload(fields));
  let given: Uint8Array = new Uint8Array();
  try {
    given = b64UrlToBytes(parsed.sig);
  } catch {
    given = new Uint8Array();
  }
  if (!timingSafeEqual(expectedSig, given)) return { ok: false, reason: "mismatch" };
  if (parsed.exp < nowSeconds) return { ok: false, reason: "expired" };
  return { ok: true, fields };
}
