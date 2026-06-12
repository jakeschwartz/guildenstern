// send-push: triggered by a database webhook on messages.insert. Looks up
// the thread's partnership members, fans out APNs notifications to each
// recipient's tokens (excluding the sender). Talks to APNs HTTP/2 directly
// using a JWT signed with the .p8 key.
//
// Required secrets (set via `supabase secrets set ...`):
//   APPLE_TEAM_ID         - 10-char team ID
//   APPLE_BUNDLE_ID       - app bundle ID (= APNs "topic")
//   APPLE_APNS_KEY_ID     - 10-char key ID
//   APPLE_APNS_PRIVATE_KEY - contents of the .p8 file, multiline

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { create as createJWT, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEAM_ID = Deno.env.get("APPLE_TEAM_ID")!;
const BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID")!;
const APNS_KEY_ID = Deno.env.get("APPLE_APNS_KEY_ID")!;
const APNS_PRIVATE_KEY = Deno.env.get("APPLE_APNS_PRIVATE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

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

// --- types ---
// Two payload shapes:
// 1. The messages-INSERT webhook (pg_net trigger on every new message).
// 2. CARDS_ASSIGNED — fired by the ops_cards statement trigger when a burst
//    lands items on a partner. The "waiting on you" push: the highest-value
//    notification in the app, because something concrete just landed on
//    your plate from your partner.
type MessagePayload = {
  type: "INSERT";
  table: "messages";
  record: {
    id: string;
    thread_id: string;
    author_kind: "human" | "agent";
    author_user_id: string | null;
    body: string;
    context?: "main" | "otis_chat";
  };
};
type CardsPayload = {
  type: "CARDS_ASSIGNED";
  owner_id: string;
  source_user_id: string;
  thread_id: string;
  titles: string[];
};
type WebhookPayload = MessagePayload | CardsPayload;

// Recipient's open-item count → app icon badge. The red number that sits on
// the icon until the items are handled is the most persistent attention cue
// iOS allows.
async function pendingCountFor(userId: string): Promise<number> {
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
  alert: { title: string; body: string },
  opts: { badge?: number; threadId?: string } = {},
): Promise<{ status: number; body?: string }> {
  const host =
    apnsEnv === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert,
        sound: "default",
        ...(opts.badge !== undefined ? { badge: opts.badge } : {}),
        // Group notifications per conversation, like iMessage.
        ...(opts.threadId ? { "thread-id": opts.threadId } : {}),
        // Time Sensitive: stays on the lock screen longer and can break
        // through Focus modes. Requires the time-sensitive entitlement on
        // the app; without it APNs gracefully downgrades to active.
        "interruption-level": "time-sensitive",
        "relevance-score": 0.9,
      },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    return { status: res.status, body: errBody };
  }
  return { status: res.status };
}

// --- handler ---
Deno.serve(async (req) => {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // --- "Waiting on you" push: items just landed on a partner ---
  if (payload.type === "CARDS_ASSIGNED") {
    const { owner_id, source_user_id, thread_id, titles } = payload;
    if (!owner_id || owner_id === source_user_id || !titles?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { "content-type": "application/json" },
      });
    }
    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", source_user_id)
      .single();
    const senderFirst = (sender?.name ?? "Your partner").split(" ")[0];
    const shown = titles.slice(0, 3).join(", ");
    const more = titles.length > 3 ? ` +${titles.length - 3} more` : "";
    const alert = {
      title: `✅ ${senderFirst} put ${titles.length === 1 ? "something" : `${titles.length} things`} on your list`,
      body: shown + more,
    };
    const badge = await pendingCountFor(owner_id);
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token, apns_env")
      .eq("user_id", owner_id)
      .eq("platform", "ios");
    if (!tokens?.length) {
      return new Response(JSON.stringify({ sent: 0, note: "no tokens" }), {
        headers: { "content-type": "application/json" },
      });
    }
    const jwt = await getApnsJwt();
    const results = await Promise.all(
      tokens.map((t) =>
        sendApns(
          jwt,
          t.token,
          (t.apns_env as "production" | "sandbox") ?? "production",
          alert,
          { badge, threadId: thread_id },
        ),
      ),
    );
    return new Response(
      JSON.stringify({
        sent: results.filter((r) => r.status === 200).length,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const msg = payload.record;
  if (!msg) return new Response("no record", { status: 400 });

  // Find the thread → partnership → other members.
  const { data: thread } = await supabase
    .from("threads")
    .select("id, kind, partnership_id, owner_id, title")
    .eq("id", msg.thread_id)
    .single();
  if (!thread) return new Response("thread not found", { status: 200 });

  let recipientIds: string[] = [];
  if (thread.kind === "partnership" && thread.partnership_id) {
    const { data: members } = await supabase
      .from("partnership_members")
      .select("user_id")
      .eq("partnership_id", thread.partnership_id);
    recipientIds = (members ?? [])
      .map((m) => m.user_id)
      .filter((id) => id !== msg.author_user_id);
  } else if (thread.kind === "personal" && thread.owner_id) {
    // Personal threads only push to the owner; skip if owner is sender
    // (e.g., user typed something themselves into their own home).
    if (thread.owner_id !== msg.author_user_id) recipientIds = [thread.owner_id];
  }
  if (recipientIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Emoji-coded titles — iOS doesn't allow custom banner colors, so the
  // emoji IS the color. 💚 = your partner (the green of the partnership),
  // 🟢 = Otis, 🟣 = Mira. Voice rule per UX_SPEC §8.4: Mira for you-alone,
  // Otis for shared rooms.
  let title = "Guildenstern";
  if (msg.author_kind === "agent") {
    title = thread.kind === "personal" ? "🟣 Mira" : "🟢 Otis";
  } else if (msg.author_user_id) {
    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", msg.author_user_id)
      .single();
    if (sender?.name) title = `💚 ${sender.name}`;
  }
  const alert = {
    title,
    body: msg.body.length > 160 ? msg.body.slice(0, 157) + "…" : msg.body,
  };

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token, apns_env, platform, user_id")
    .in("user_id", recipientIds)
    .eq("platform", "ios");
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, note: "no tokens" }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Per-recipient badge = their open-item count.
  const badgeByUser = new Map<string, number>();
  for (const rid of recipientIds) {
    badgeByUser.set(rid, await pendingCountFor(rid));
  }

  const jwt = await getApnsJwt();
  const results = await Promise.all(
    tokens.map((t) =>
      sendApns(
        jwt,
        t.token,
        (t.apns_env as "production" | "sandbox") ?? "production",
        alert,
        {
          badge: badgeByUser.get(t.user_id as string),
          threadId: msg.thread_id,
        },
      ),
    ),
  );

  // Clean up dead tokens (Apple returns 410 Gone for tokens that no longer
  // belong to the app — typically after uninstall).
  const deadTokens = tokens
    .filter((_, i) => results[i]?.status === 410)
    .map((t) => t.token);
  if (deadTokens.length > 0) {
    await supabase.from("push_tokens").delete().in("token", deadTokens);
  }

  return new Response(
    JSON.stringify({
      sent: results.filter((r) => r.status === 200).length,
      failed: results.filter((r) => r.status !== 200).length,
      deadCleaned: deadTokens.length,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
