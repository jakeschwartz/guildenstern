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

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are Otis. Synthesize where the two partners stand on the topic "{TOPIC}".

Output a 1-2 sentence prose summary, plus 2-4 sections with TOPIC-AWARE labels. NOT generic "Decided/Open" — name the sections after the actual things being discussed (e.g. for a party: "Invite list", "Venue", "Date"; for a trip: "Destination", "Dates", "Lodging").

Each section has 1-5 items. Each item: short text + status (done = confirmed; open = in progress; maybe = considering; action = task someone owes; flagged = blocked).

Voice: warm, concise. No fluff. No "here's where we are" preface.`;

type Section = {
  label: string;
  items: Array<{ text: string; status: string }>;
};

Deno.serve(async (req) => {
  // Verify the user is authenticated + a member of the spoke.
  const auth = req.headers.get("Authorization") ?? "";
  const userJwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!userJwt) return new Response("missing Authorization", { status: 401 });
  const { data: userData } = await supabase.auth.getUser(userJwt);
  if (!userData.user) return new Response("auth failed", { status: 401 });
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
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const { thread_id } = await req.json().catch(() => ({}));
  if (!thread_id)
    return new Response("missing thread_id", { status: 400 });

  // Load thread (must be a non-default partnership thread = a spoke).
  const { data: thread } = await supabase
    .from("threads")
    .select("id, kind, partnership_id, is_default, title")
    .eq("id", thread_id)
    .single();
  if (!thread || thread.kind !== "partnership" || thread.is_default) {
    return new Response("not a spoke", { status: 400 });
  }

  // Membership check.
  const { data: member } = await supabase
    .from("partnership_members")
    .select("user_id")
    .eq("partnership_id", thread.partnership_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return new Response("not a member", { status: 403 });

  // Pull recent messages + ops cards. Cap at 15 messages so the Claude
  // call returns within Supabase's edge-function timeout (~50s on free).
  // "Load failed" client-side is what you get when this exceeds it.
  const { data: messagesRaw } = await supabase
    .from("messages")
    .select("author_kind, author_user_id, body, created_at")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: false })
    .limit(15);
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
      const body = m.body.length > 200 ? m.body.slice(0, 200) + "…" : m.body;
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

  // Abort at 25s — under Supabase's 50s edge function timeout, so the
  // client always gets a proper error message instead of "Load failed".
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);
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
        max_tokens: 400,
      system: SYSTEM_PROMPT.replace("{TOPIC}", thread.title || "this topic"),
      tools: [
        {
          name: "synthesize",
          description: "Produce a Where-we-are synthesis for this spoke.",
          input_schema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description:
                  "1-3 sentence prose summary capturing where things stand. Natural language. No 'here's where we are' preface.",
              },
              sections: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                description:
                  "Topic-aware sections. Labels must reflect what the partners are actually discussing — not generic Decided/Open/Items.",
                items: {
                  type: "object",
                  properties: {
                    label: {
                      type: "string",
                      description:
                        "Section title in title case. Topic-specific. Example: 'Invite list', 'Venue', 'Date', 'Lodging', 'Candidates'.",
                    },
                    items: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        properties: {
                          text: {
                            type: "string",
                            description:
                              "The item — short, concrete. E.g. 'Kenny and Unha', 'Upstate Airbnb', 'A weekend in June'.",
                          },
                          status: {
                            type: "string",
                            enum: [
                              "done",
                              "open",
                              "maybe",
                              "action",
                              "flagged",
                            ],
                            description:
                              "done=confirmed; open=in progress; maybe=still considering; action=tracked task; flagged=blocked/needs attention",
                          },
                        },
                        required: ["text", "status"],
                      },
                    },
                  },
                  required: ["label", "items"],
                },
              },
            },
            required: ["summary", "sections"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "synthesize" },
      messages: [
        {
          role: "user",
          content: `Topic: "${thread.title}"

Conversation so far (oldest → newest):
${conversation || "(no messages yet)"}

Tracked items:
${itemList || "(none yet)"}

Synthesize.`,
        },
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
        ? "Claude took too long (>45s)"
        : `Claude fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      { status: 504 },
    );
  }
  clearTimeout(timeoutId);

  if (!claudeRes.ok) {
    const t = await claudeRes.text();
    console.error("Claude error", claudeRes.status, t);
    return new Response(`Claude error: ${claudeRes.status} ${t.slice(0, 80)}`, { status: 502 });
  }
  const claudeData = await claudeRes.json();
  const toolUse = claudeData.content?.find((c: any) => c.type === "tool_use");
  if (!toolUse) {
    console.error("No tool_use in Claude response", claudeData);
    return new Response("no synthesis", { status: 502 });
  }
  const result = toolUse.input as { summary: string; sections: Section[] };

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
    return new Response("db error", { status: 500 });
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
