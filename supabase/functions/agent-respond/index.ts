// agent-respond: triggered by a database webhook on messages.insert (human-author
// rows only). Decides whether the message is a "burst" of trackable items
// (respond with a structured echo) or a direct/emotional message (stay silent).
//
// Env (set via `supabase secrets set ...`):
//   ANTHROPIC_API_KEY     - Anthropic API key
// Supabase auto-injects:
//   SUPABASE_URL          - project URL
//   SUPABASE_SERVICE_ROLE_KEY - for inserting agent replies (bypasses RLS)

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT_PERSONAL = `You are Mira — the user's private 1:1 concierge inside Guildenstern. This is their personal thread with you. They talk to you alone here; no other humans see this. Your job: hold their queue, surface what needs them, ack what they tell you, and stay conversational about it.

CRITICAL DECISION you make on every incoming human message: is this something you should respond to, or is it pure social/emotional content that should ride through without an ack?

- SILENT examples (stay completely silent — these don't need a Mira response):
  - "❤️", a single emoji
  - "love you", "miss you" said TO Mira (you don't reciprocate; this is them venting to themselves)
  - Pure typo/test noise ("asdf", random keystrokes)

- RESPOND examples (almost everything else):
  - "Hi Mira" → warm short hello, ask what's up
  - "Need to call Jenny" → "Got it — calling Jenny. When?"
  - "I'm gonna need to invite Jenny to dinner" → "Noted — invite Jenny to dinner. Date in mind?"
  - "Can I see my queue?" → list what's in their queue
  - "What's on me today?" → triage
  - "Eli pickup tomorrow, contractor Thursday, diapers" → structured echo: "Got it — Eli pickup tomorrow, contractor Thursday, diapers. Sound right?"
  - A question → answer briefly or ask a clarifying question

Voice: warm, concise, lowercase-y when natural. You write like a thought partner who already knows their life. Short sentences. Don't preface. Don't over-explain.

For multi-item bursts (3+ trackable items), use the structured echo: "Got it — A, B, C. Sound right?" That's the felt-magic moment — it tells the user you heard each item discretely.

For single items or questions, respond conversationally — one or two short sentences, plus a clarifying question if you need a detail (when, who, where).

Return only valid JSON matching the tool schema. Do not chat outside the schema. Do not preface.`;

const SYSTEM_PROMPT_PARTNERSHIP = `You are the agent inside Guildenstern, a two-person partnership inbox. Each partnership thread is a buffer between two people. Your job in this thread is to be the asynchronous double-buffer between them.

CRITICAL DECISION you make on every incoming human message: is this a BURST (trackable items the recipient will need to act on or remember), or a DIRECT message (emotional, conversational, or a single in-the-moment reply that should ride through untouched)?

- DIRECT examples: "love you", "❤️", "miss you", "running 10 min late", "ok", "thanks", "yeah", "lol", a single emoji, a question that just needs an answer right now
- BURST examples: "Eli pickup tomorrow, contractor coming Thursday, need diapers from CVS"
- Edge cases: a message with one item that is clearly an ask to add it to mental load → BURST. A message that mixes a logistics item with affection → BURST (just echo the items).

If DIRECT, you stay completely silent. Do not respond.

If BURST, you respond with a structured echo in the partner's voice. Format: "Got it — A, B, C. Sound right?" — verbatim ending.

Items: short noun phrases, in order, max 6. Strip filler. Keep critical timing attached.

CRITICAL: NEVER drop an item silently. Prefer noisy mis-routing over silent drop.

Return only valid JSON matching the tool schema. Do not chat. Do not preface.`;

type WebhookPayload = {
  type: "INSERT";
  table: "messages";
  record: {
    id: string;
    thread_id: string;
    author_kind: "human" | "agent";
    author_user_id: string | null;
    body: string;
    created_at: string;
  };
};

Deno.serve(async (req) => {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const msg = payload.record;
  if (!msg || msg.author_kind !== "human") {
    // Not a human message; silently ignore. (Defensive — the trigger filter
    // should already ensure this.)
    return new Response("skipped", { status: 200 });
  }

  // Verify the thread exists and select the right system prompt based on
  // whether it's the user's personal Mira thread or a shared partnership
  // thread (different conversational dynamic — see prompts above).
  const { data: thread, error: tErr } = await supabase
    .from("threads")
    .select("id, kind, partnership_id, owner_id")
    .eq("id", msg.thread_id)
    .single();
  if (tErr || !thread) {
    return new Response("thread not found", { status: 200 });
  }
  const systemPrompt =
    thread.kind === "personal" ? SYSTEM_PROMPT_PERSONAL : SYSTEM_PROMPT_PARTNERSHIP;

  // Pull recent context (the last 10 messages) so Claude can disambiguate.
  const { data: recent } = await supabase
    .from("messages")
    .select("author_kind, body, created_at")
    .eq("thread_id", msg.thread_id)
    .order("created_at", { ascending: false })
    .limit(10);
  const context = (recent ?? [])
    .reverse()
    .map((m) => `${m.author_kind === "agent" ? "Agent" : "Partner"}: ${m.body}`)
    .join("\n");

  // Call Claude with a tool that forces structured output.
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: systemPrompt,
      tools: [
        {
          name: "decide",
          description:
            "Decide whether to respond to this message, and what to say.",
          input_schema: {
            type: "object",
            properties: {
              respond: {
                type: "boolean",
                description:
                  "true if the agent should reply at all; false to stay silent (pure emoji, social-to-Mira, typo noise, or — in partnership threads — direct/emotional messages that ride through)",
              },
              kind: {
                type: "string",
                enum: ["burst", "conversational"],
                description:
                  "burst = multiple trackable items → structured echo format. conversational = short reply, ack with optional clarifying question. Only used when respond=true.",
              },
              ack: {
                type: "string",
                description:
                  "The actual message text the agent will say. Empty string if respond=false. If burst: starts with 'Got it — ' and ends with ' Sound right?'. If conversational: 1-2 sentences in Mira's warm voice.",
              },
              items: {
                type: "array",
                items: { type: "string" },
                description:
                  "If burst: 1-6 short item phrases in order. Otherwise: empty.",
              },
            },
            required: ["respond", "kind", "ack", "items"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "decide" },
      messages: [
        {
          role: "user",
          content: `Recent thread context (oldest → newest):\n${context}\n\nThe most recent line (the one to decide on) is the bottom one.`,
        },
      ],
    }),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    console.error("Claude API error", claudeRes.status, errText);
    return new Response(`Claude error: ${claudeRes.status}`, { status: 500 });
  }

  const claudeData = await claudeRes.json();
  const toolUse = claudeData.content?.find((c: any) => c.type === "tool_use");
  if (!toolUse) {
    console.error("No tool_use in Claude response", claudeData);
    return new Response("no decision", { status: 200 });
  }

  const decision = toolUse.input as {
    respond: boolean;
    kind: "burst" | "conversational";
    items: string[];
    ack: string;
  };

  if (!decision.respond || !decision.ack.trim()) {
    return new Response(JSON.stringify({ silent: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Insert the structured echo as an agent message in the same thread.
  const { error: insertErr } = await supabase.from("messages").insert({
    thread_id: msg.thread_id,
    author_kind: "agent",
    author_user_id: null,
    body: decision.ack.trim(),
  });
  if (insertErr) {
    console.error("Failed to insert agent ack", insertErr);
    return new Response("insert failed", { status: 500 });
  }

  return new Response(
    JSON.stringify({ silent: false, items: decision.items }),
    { headers: { "content-type": "application/json" } },
  );
});
