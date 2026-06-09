// synthesize-spoke: Otis reads a spoke's messages + items and produces a
// topic-aware "Where we are" synthesis. Topic-aware means the section
// labels come from the conversation ("Invite list", "Venue", "Date" for a
// party — not generic "Decided/Open"). Result cached in spoke_summaries.
//
// Invoked by the client when the user lands on the "Where we are" pane in
// a spoke. JWT-authenticated; checks the user is a member of the spoke's
// partnership before reading/writing.
//
// Env required:
//   ANTHROPIC_API_KEY
// Auto-injected by Supabase:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// CORS: client is the iOS WKWebView (origin capacitor://localhost on
// native; localhost on web preview). POST + JSON + Bearer triggers
// preflight; without these headers the WebView blocks the response with
// the generic "Load failed" error. (Same reason fetch-google-events works
// without these — it's a GET, which is a simple request, no preflight.)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are Otis. Synthesize where two partners stand on "{TOPIC}".

Respond with VALID JSON only. No markdown code blocks. No commentary. Start with { and end with }. Schema:

{
  "summary": "1-2 sentences. Warm, concise. No 'here's where we are' preface.",
  "sections": [
    {
      "label": "TOPIC-AWARE title — NOT 'Decided/Open'. For a party: 'Invite list', 'Venue', 'Date'. For a trip: 'Destination', 'Dates', 'Lodging'. For a reno: 'Contractors', 'Budget'.",
      "items": [
        { "text": "short concrete item", "status": "one of: done | open | maybe | action | flagged" }
      ]
    }
  ]
}

2-4 sections. 1-5 items per section. Status: done=confirmed; open=in progress; maybe=considering; action=task someone owes; flagged=blocked.`;

type Section = {
  label: string;
  items: Array<{ text: string; status: string }>;
};

Deno.serve(async (req) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Verify the user is authenticated + a member of the spoke.
  const auth = req.headers.get("Authorization") ?? "";
  const userJwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!userJwt)
    return new Response("missing Authorization", {
      status: 401,
      headers: corsHeaders,
    });
  const { data: userData } = await supabase.auth.getUser(userJwt);
  if (!userData.user)
    return new Response("auth failed", { status: 401, headers: corsHeaders });
  const userId = userData.user.id;

  // Diagnostic ping mode: returns immediately without calling Claude. Lets us
  // confirm the auth + network path works end-to-end independent of latency.
  const url = new URL(req.url);
  if (url.searchParams.get("debug") === "ping") {
    return new Response(
      JSON.stringify({
        summary: "Ping OK — auth + network path working.",
        sections: [
          {
            label: "Diagnostic",
            items: [
              { text: `Authenticated as ${userId.slice(0, 8)}`, status: "done" },
              { text: "Function reached Deno runtime", status: "done" },
              { text: "Returning without calling Claude", status: "done" },
            ],
          },
        ],
        updated_at: new Date().toISOString(),
      }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const { thread_id } = await req.json().catch(() => ({}));
  if (!thread_id)
    return new Response("missing thread_id", { status: 400, headers: corsHeaders });

  // Load thread (must be a non-default partnership thread = a spoke).
  const { data: thread } = await supabase
    .from("threads")
    .select("id, kind, partnership_id, is_default, title")
    .eq("id", thread_id)
    .single();
  if (!thread || thread.kind !== "partnership" || thread.is_default) {
    return new Response("not a spoke", { status: 400, headers: corsHeaders });
  }

  // Membership check.
  const { data: member } = await supabase
    .from("partnership_members")
    .select("user_id")
    .eq("partnership_id", thread.partnership_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member)
    return new Response("not a member", { status: 403, headers: corsHeaders });

  // Pull recent messages + ops cards. Aggressively capped — Claude haiku
  // with this tool schema gets slow fast as context grows, and "Load
  // failed" client-side is what we see when total wall-clock exceeds
  // Supabase's edge-function limit.
  const { data: messagesRaw } = await supabase
    .from("messages")
    .select("author_kind, author_user_id, body, created_at")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: false })
    .limit(10);
  const messages = (messagesRaw ?? []).reverse();

  const { data: cards } = await supabase
    .from("ops_cards")
    .select("title, subtitle, status, owner_id, when_label")
    .eq("thread_id", thread_id);

  // Resolve user_id → display name for nicer context to Claude.
  const userIds = Array.from(
    new Set(
      (messages ?? [])
        .map((m) => m.author_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const profilesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", userIds);
    (profiles ?? []).forEach((p) =>
      profilesById.set(p.id, p.name ?? "Partner"),
    );
  }

  const conversation = messages
    .map((m) => {
      const who =
        m.author_kind === "agent"
          ? "Otis"
          : profilesById.get(m.author_user_id ?? "") ?? "Partner";
      // Truncate to 200 chars per message; even shorter for agent (just header).
      const body = m.body.length > 120 ? m.body.slice(0, 120) + "…" : m.body;
      return `${who}: ${body}`;
    })
    .join("\n");

  const itemList = (cards ?? [])
    .map(
      (c) =>
        `- ${c.title}${c.subtitle ? ` (${c.subtitle})` : ""} [${c.status}${
          c.when_label ? `, ${c.when_label}` : ""
        }]`,
    )
    .join("\n");

  // Abort the Claude call at 15s. Whatever the actual edge-function or
  // WebView timeout is, this stays well under it so we always return a
  // useful error to the client instead of "Load failed".
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  let claudeRes: Response;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT.replace("{TOPIC}", thread.title || "this topic"),
        messages: [
          {
            role: "user",
            content: `Topic: "${thread.title}"

Conversation (oldest → newest):
${conversation || "(no messages yet)"}

Tracked items:
${itemList || "(none yet)"}`,
          },
          // Prefill the assistant with "{" — forces Claude to immediately
          // start a JSON object, much faster than letting it think about
          // tool calling. Standard latency trick.
          { role: "assistant", content: "{" },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const isAbort =
      e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    console.error("[synthesize-spoke] claude fetch failed", e);
    return new Response(
      isAbort
        ? "Claude took too long (>15s)"
        : `Claude fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      { status: 504, headers: corsHeaders },
    );
  }
  clearTimeout(timeoutId);

  if (!claudeRes.ok) {
    const t = await claudeRes.text();
    console.error("Claude error", claudeRes.status, t);
    return new Response(`Claude error: ${claudeRes.status} ${t.slice(0, 80)}`, {
      status: 502,
      headers: corsHeaders,
    });
  }
  const claudeData = await claudeRes.json();
  const textBlock = claudeData.content?.find((c: any) => c.type === "text");
  if (!textBlock) {
    console.error("No text content in Claude response", claudeData);
    return new Response("no synthesis", { status: 502, headers: corsHeaders });
  }
  // We prefilled the assistant with "{" so the actual content starts as if
  // it's INSIDE a JSON object. Re-add the opening brace before parsing.
  // Also tolerate trailing junk after the closing brace by slicing to the
  // last "}".
  const raw = "{" + textBlock.text;
  const lastBrace = raw.lastIndexOf("}");
  const jsonStr = lastBrace > 0 ? raw.slice(0, lastBrace + 1) : raw;
  let result: { summary: string; sections: Section[] };
  try {
    result = JSON.parse(jsonStr) as { summary: string; sections: Section[] };
  } catch (e) {
    console.error("[synthesize-spoke] JSON parse failed", e, jsonStr);
    return new Response(
      `JSON parse failed: ${jsonStr.slice(0, 100)}`,
      { status: 502, headers: corsHeaders },
    );
  }
  if (!result?.summary || !Array.isArray(result.sections)) {
    console.error("[synthesize-spoke] missing fields", result);
    return new Response(`missing fields in response`, {
      status: 502,
      headers: corsHeaders,
    });
  }

  // Upsert cached summary.
  const { error: upErr } = await supabase
    .from("spoke_summaries")
    .upsert(
      {
        thread_id,
        summary: result.summary,
        sections: result.sections,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "thread_id" },
    );
  if (upErr) {
    console.error("[synthesize-spoke] upsert failed", upErr);
    return new Response("db error", { status: 500, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      summary: result.summary,
      sections: result.sections,
      updated_at: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
