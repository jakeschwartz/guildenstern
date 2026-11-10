// Shared APNs delivery for every push the app sends (send-push, send-rundown).
// Talks to APNs HTTP/2 directly using a JWT signed with the .p8 key.
//
// Two levels, so the buzzes stay meaningful:
//   active  — sound + Time Sensitive.
//   passive — silent, straight to Notification Center.
// Every push is logged in push_log and carries push_id (so a tap is counted)
// and, when it's about a thread, thread_id (so a tap opens it). No thread_id
// means "open the inbox", where Mira's rundown lives.
//
// Required secrets (set via `supabase secrets set ...`):
//   APPLE_TEAM_ID         - 10-char team ID
//   APPLE_BUNDLE_ID       - app bundle ID (= APNs "topic")
//   APPLE_APNS_KEY_ID     - 10-char key ID
//   APPLE_APNS_PRIVATE_KEY - contents of the .p8 file, multiline

// deno-lint-ignore-file no-explicit-any
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { create as createJWT, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const TEAM_ID = Deno.env.get("APPLE_TEAM_ID")!;
const BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID")!;
const APNS_KEY_ID = Deno.env.get("APPLE_APNS_KEY_ID")!;
const APNS_PRIVATE_KEY = Deno.env.get("APPLE_APNS_PRIVATE_KEY")!;

export type Level = "active" | "passive";
export type Alert = { title: string; body: string };

// --- APNs JWT (cached for up to ~50 min; Apple rejects tokens older than 1hr) ---
let cachedToken: { jwt: string; expires: number } | null = null;

async function importPrivateKey(): Promise<CryptoKey> {
  const pem = APNS_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires > now + 60) return cachedToken.jwt;
  const key = await importPrivateKey();
  const jwt = await createJWT(
    { alg: "ES256", kid: APNS_KEY_ID },
    { iss: TEAM_ID, iat: getNumericDate(0) },
    key,
  );
  cachedToken = { jwt, expires: now + 50 * 60 };
  return jwt;
}

// Recipient's open-item count → app icon badge. The red number that sits on
// the icon until the items are handled is the most persistent attention cue
// iOS allows.
async function pendingCountFor(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("ops_cards")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("status", "pending");
  return count ?? 0;
}

// --- send to one APNs token ---
async function sendApns(
  jwt: string,
  token: string,
  apnsEnv: "production" | "sandbox",
  alert: Alert,
  level: Level,
  opts: { badge: number; threadId: string | null; pushId: string | null },
): Promise<{ status: number; body?: string }> {
  const host =
    apnsEnv === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      // Passive pushes don't need to wake the device right away.
      "apns-priority": level === "active" ? "10" : "5",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert,
        badge: opts.badge,
        // Group notifications per conversation, like iMessage. Rundowns stack
        // together.
        "thread-id": opts.threadId ?? "rundown",
        ...(level === "active"
          ? {
            sound: "default",
            // Time Sensitive: stays on the lock screen longer and can break
            // through Focus modes. Requires the time-sensitive entitlement
            // on the app; without it APNs gracefully downgrades to active.
            "interruption-level": "time-sensitive",
            "relevance-score": 0.9,
          }
          : {
            // No sound, no screen wake: goes straight to Notification Center.
            "interruption-level": "passive",
            "relevance-score": 0.2,
          }),
      },
      // Read by the app when the notification is tapped (src/lib/push.ts).
      ...(opts.threadId ? { thread_id: opts.threadId } : {}),
      ...(opts.pushId ? { push_id: opts.pushId } : {}),
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    return { status: res.status, body: errBody };
  }
  return { status: res.status };
}

// --- deliver one notification to one person (all their devices) ---
export async function pushToUser(
  supabase: SupabaseClient,
  userId: string,
  alert: Alert,
  level: Level,
  meta: { kind: string; threadId: string | null; variant?: string; slot?: string },
): Promise<{ sent: number; failed: number }> {
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token, apns_env")
    .eq("user_id", userId)
    .eq("platform", "ios");
  if (!tokens?.length) return { sent: 0, failed: 0 };

  // Log first so the push can carry its id. Logging must never cost a push.
  const { data: logRow, error: logErr } = await supabase
    .from("push_log")
    .insert({
      user_id: userId,
      kind: meta.kind,
      level,
      thread_id: meta.threadId,
      variant: meta.variant ?? null,
      slot: meta.slot ?? null,
    })
    .select("id")
    .single();
  if (logErr) console.error("[push] push_log insert failed", logErr);

  const badge = await pendingCountFor(supabase, userId);
  const jwt = await getApnsJwt();
  const results = await Promise.all(
    tokens.map((t: any) =>
      sendApns(
        jwt,
        t.token,
        (t.apns_env as "production" | "sandbox") ?? "production",
        alert,
        level,
        { badge, threadId: meta.threadId, pushId: logRow?.id ?? null },
      )
    ),
  );

  // Clean up dead tokens (Apple returns 410 Gone for tokens that no longer
  // belong to the app — typically after uninstall).
  const deadTokens = tokens
    .filter((_: any, i: number) => results[i]?.status === 410)
    .map((t: any) => t.token);
  if (deadTokens.length > 0) {
    await supabase.from("push_tokens").delete().in("token", deadTokens);
  }

  return {
    sent: results.filter((r) => r.status === 200).length,
    failed: results.filter((r) => r.status !== 200).length,
  };
}

export async function firstNameOf(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return "Your partner";
  const { data } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();
  return ((data?.name as string | undefined) ?? "Your partner").split(" ")[0]!;
}
