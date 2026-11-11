// scan-gmail: Mira reads each connected person's recent inbox for household
// logistics and files them as private suggestions (email_items). Nothing
// reaches the shared list until the person taps Add in their rundown.
//
// Two ways in:
//   - Scheduled (pg_cron 'scan-gmail', every 30 min, no auth): everyone who
//     granted gmail.readonly, each at most once per MIN_RESCAN_MS.
//   - Signed-in user (Bearer JWT), right after connecting Gmail: scans just
//     them, ignoring the rate limit so suggestions show up immediately.
//
// Privacy: only From, Subject and a short plain-text excerpt go to the model.
// Only sender name, subject and the extracted item are stored. Bodies are
// never persisted.
//
// Env: ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { getValidGoogleAccessToken } from "../_shared/google_token.ts";
import {
  DEFAULT_TZ,
  describeNow,
  isValidTz,
  resolveDue,
  upcomingCalendar,
} from "../_shared/dates.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Background job, so speed doesn't matter: the current default model, at low
// effort (as accurate as medium on our triage samples, fewer tokens). Haiku
// 4.5 kept misresolving "next Wednesday" in emails received days earlier.
const MODEL = "claude-opus-5-5";
const EFFORT = "low";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MIN_RESCAN_MS = 10 * 60 * 1000;
const FIRST_SCAN_DAYS = 3;
const MAX_MESSAGES = 30;
const BATCH = 10;
const EXCERPT_CHARS = 1200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `You are Mira, a household concierge. You're reading a person's recent email to find HOUSEHOLD LOGISTICS they or their partner need to act on: bills and payments due, appointments (doctor, dentist, vet, school, service visits), school notices that need a response or a date to remember, contractors and repairs, deliveries or installs that need someone home, renewals and deadlines (registration, passports, insurance), RSVPs, kid activities.

NOT actionable: marketing, newsletters, receipts with nothing left to do, shipping updates that need nothing, social notifications, work email, personal conversation, security alerts, anything already done.

Be conservative. A false suggestion costs the person attention; a missed one costs little because they still have their inbox. When in doubt, actionable=false.

For each actionable email write a title the way a partner would say it on a shared list: concrete, with WHO and WHERE ("Pay Con Ed bill", "Eli's dentist at Park Slope Pediatric", "Be home for Verizon install"). Keep amounts and confirmation numbers out of the title; put the most useful one detail in subtitle. If one email holds several things, file the one most likely to be missed that needs someone to DO something (arrange a pickup, be home, pay, sign), not a passive reminder, and mention the other in subtitle only if it also needs action. Relative dates INSIDE an email ("tomorrow", "this Friday", "next Wednesday") are relative to the day that email was RECEIVED (its Received line), not today; resolve them from that day. Leave due_date empty if the email gives no specific day.`;

// Structured output: the API guarantees the response text matches this
// schema (every object needs additionalProperties: false).
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    emails: {
      type: "array",
      description: "One decision for every email given.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
            id: { type: "string", description: "The email id given." },
            actionable: { type: "boolean" },
            title: { type: "string", description: "Empty if not actionable." },
            subtitle: {
              type: "string",
              description:
                "One useful detail (amount, location, what to bring). Empty if none.",
            },
            due_date: {
              type: "string",
              description:
                "YYYY-MM-DD the action is due. Relative days and weekdays come from the calendar given; explicit dates (e.g. 'expires 12/31') are used as written even if beyond it. For a bill or renewal, the due/expiry date. Empty only if no day is stated.",
            },
            due_time: {
              type: "string",
              description: "24h HH:MM local if a time is stated, else empty.",
            },
          },
        required: ["id", "actionable", "title", "subtitle", "due_date", "due_time"],
      },
    },
  },
  required: ["emails"],
};

type Fetched = {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  receivedAt: string | null;
  excerpt: string;
};

// ---------- Gmail ----------

const gmail = async (token: string, path: string) => {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`gmail ${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const b64url = (s: string) => {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
};

// First text/plain part, else text/html with tags stripped.
const extractText = (payload: any): string => {
  const parts: any[] = [];
  const walk = (p: any) => {
    if (!p) return;
    parts.push(p);
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain) return b64url(plain.body.data);
  const html = parts.find((p) => p.mimeType === "text/html" && p.body?.data);
  if (html) {
    return b64url(html.body.data)
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }
  return "";
};

const header = (payload: any, name: string) =>
  (payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

const fetchMessage = async (token: string, id: string): Promise<Fetched> => {
  const m = await gmail(token, `messages/${id}?format=full`);
  const from = header(m.payload, "From");
  const fromName = from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || from;
  const text = extractText(m.payload).replace(/\s+/g, " ").trim();
  return {
    id,
    threadId: m.threadId,
    from,
    fromName,
    subject: header(m.payload, "Subject"),
    receivedAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
    excerpt: (text || m.snippet || "").slice(0, EXCERPT_CHARS),
  };
};

// ---------- model ----------

const triage = async (batch: Fetched[], nowLine: string, tz: string) => {
  const listing = batch
    .map(
      (e) =>
        `<email id="${e.id}">\nFrom: ${e.from}\nSubject: ${e.subject}\nReceived: ${e.receivedAt ? describeNow(new Date(e.receivedAt), tz) : "unknown"}\n${e.excerpt}\n</email>`,
    )
    .join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      // On a safety-classifier refusal, the API reruns the request on a
      // fallback model inside the same call instead of dropping the batch.
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: `${nowLine}\n\n${listing}` }],
    }),
  });
  if (!res.ok) throw new Error(`claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") {
    // Whole fallback chain declined. Record nothing for this batch; it is
    // retried on the next run (unseen ids stay unseen).
    throw new Error(`claude refusal: ${data.stop_details?.category ?? "unknown"}`);
  }
  if (data.stop_reason === "max_tokens") throw new Error("claude hit max_tokens");
  const text = data.content?.find((c: any) => c.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as { emails?: unknown };
  return (parsed.emails ?? []) as Array<{
    id: string;
    actionable: boolean;
    title: string;
    subtitle: string;
    due_date: string;
    due_time: string;
  }>;
};

// ---------- one person ----------

async function scanUser(userId: string, force: boolean) {
  const { data: state } = await supabase
    .from("gmail_scan_state")
    .select("last_scanned_at")
    .eq("user_id", userId)
    .maybeSingle();
  const last = state?.last_scanned_at ? Date.parse(state.last_scanned_at) : null;
  if (!force && last && Date.now() - last < MIN_RESCAN_MS) {
    return { userId, skipped: "recent" };
  }

  const token = await getValidGoogleAccessToken(supabase, userId);
  if (!token) return { userId, skipped: "not connected" };
  if (!token.scope.includes(GMAIL_SCOPE)) return { userId, skipped: "no gmail scope" };

  const startedAt = new Date();
  // Overlap the previous window by an hour so nothing slips between runs;
  // already-seen ids are skipped below.
  const since = last
    ? last - 60 * 60 * 1000
    : Date.now() - FIRST_SCAN_DAYS * 24 * 60 * 60 * 1000;
  const q = [
    `after:${Math.floor(since / 1000)}`,
    "in:inbox",
    "-category:promotions",
    "-category:social",
    "-category:forums",
  ].join(" ");

  try {
    const list = await gmail(
      token.access_token,
      `messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(q)}`,
    );
    const ids: string[] = (list.messages ?? []).map((m: any) => m.id);

    const { data: seenRows } = ids.length
      ? await supabase
          .from("email_items")
          .select("gmail_message_id")
          .eq("user_id", userId)
          .in("gmail_message_id", ids)
      : { data: [] };
    const seen = new Set((seenRows ?? []).map((r) => r.gmail_message_id));
    const fresh = ids.filter((id) => !seen.has(id));

    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    const tz = isValidTz(profile?.timezone) ? profile!.timezone : DEFAULT_TZ;

    let suggested = 0;
    for (let i = 0; i < fresh.length; i += BATCH) {
      const fetched = await Promise.all(
        fresh.slice(i, i + BATCH).map((id) => fetchMessage(token.access_token, id)),
      );
      // Start the calendar at the oldest email's received day, so its
      // relative dates are lookups too.
      const oldest = fetched
        .map((e) => (e.receivedAt ? new Date(e.receivedAt) : startedAt))
        .reduce((a, b) => (a < b ? a : b), startedAt);
      const nowLine = `Person's current local time: ${describeNow(startedAt, tz)} (${tz}).\n${upcomingCalendar(startedAt, tz, oldest)}`;
      const decisions = new Map((await triage(fetched, nowLine, tz)).map((d) => [d.id, d]));
      const rows = fetched.map((e) => {
        const d = decisions.get(e.id);
        const actionable = Boolean(d?.actionable && d.title?.trim());
        const due = actionable ? resolveDue(d!.due_date, d!.due_time, tz) : null;
        if (actionable) suggested++;
        return {
          user_id: userId,
          gmail_message_id: e.id,
          gmail_thread_id: e.threadId,
          from_name: e.fromName.slice(0, 120),
          subject: e.subject.slice(0, 300),
          received_at: e.receivedAt,
          actionable,
          title: actionable ? d!.title.trim() : null,
          subtitle: actionable ? d!.subtitle?.trim() || null : null,
          due_at: due?.due_at ?? null,
          due_has_time: due?.due_has_time ?? false,
        };
      });
      const { error } = await supabase
        .from("email_items")
        .upsert(rows, { onConflict: "user_id,gmail_message_id", ignoreDuplicates: true });
      if (error) throw error;
    }

    await supabase.from("gmail_scan_state").upsert({
      user_id: userId,
      last_scanned_at: startedAt.toISOString(),
      last_error: null,
    });
    return { userId, scanned: fresh.length, suggested };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[scan-gmail] ${userId}`, msg);
    await supabase.from("gmail_scan_state").upsert({
      user_id: userId,
      last_scanned_at: state?.last_scanned_at ?? null,
      last_error: msg.slice(0, 500),
    });
    return { userId, error: msg };
  }
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (jwt) {
      const { data } = await supabase.auth.getUser(jwt);
      if (data.user) return json(await scanUser(data.user.id, true));
    }

    const { data: rows } = await supabase
      .from("google_oauth_tokens")
      .select("user_id, scope");
    const targets = (rows ?? [])
      .filter((r) => (r.scope ?? "").includes(GMAIL_SCOPE))
      .map((r) => r.user_id as string);
    const results = [];
    for (const userId of targets) results.push(await scanUser(userId, false));
    return json({ users: targets.length, results });
  } catch (e) {
    console.error("[scan-gmail] uncaught", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
