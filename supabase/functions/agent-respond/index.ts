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

const SYSTEM_PROMPT = `You are the agent inside Guildenstern, a two-person partnership inbox. Each partnership thread is a buffer between two people. Your job in this thread is to be the asynchronous double-buffer between them.

CRITICAL DECISION you make on every incoming human message: is this a BURST (trackable items the recipient will need to act on or remember), or a DIRECT message (emotional, conversational, or a single in-the-moment reply that should ride through untouched)?

- DIRECT examples: "love you", "❤️", "miss you", "running 10 min late", "ok", "thanks", "yeah", "lol", a single emoji, a question that just needs an answer right now ("what time is the show?")
- BURST examples: "Eli pickup tomorrow, contractor coming Thursday, need diapers from CVS", "Don't forget the playdate is Saturday and the camp form is due Friday"
- Edge cases: a message with one item that is clearly an ask to add it to mental load → BURST. A message that mixes a logistics item with affection → BURST (just echo the items, not the affection).

If DIRECT, you stay completely silent. Do not respond. The message rides through unmediated.

If BURST, you respond with a structured echo in the partner's voice. Format:
  "Got it — <item 1>, <item 2>, <item 3>. Sound right?"

Each item is a short noun-or-noun-phrase, NOT a paraphrase of the original message. Strip filler ("tomorrow", "Thursday" stays attached to the item if it's the critical timing). Keep items in the order they appeared. Max 6 items per echo. End with "Sound right?" verbatim — that's the ratification prompt.

Examples of good echoes:
- Input: "Eli pickup tomorrow, contractor coming Thursday, need diapers from CVS"
  Echo: "Got it — Eli pickup tomorrow, contractor Thursday, diapers from CVS. Sound right?"
- Input: "love you, also kids have a half day Friday"
  Echo: "Got it — kids have a half day Friday. Sound right?"
- Input: "❤️"
  (silent)
- Input: "running 10 min late"
  (silent)

CRITICAL: NEVER drop an item silently. If you're uncertain whether something belongs in the echo, INCLUDE IT. The cost of mis-routing a noise item is small; the cost of silently dropping a real one is catastrophic ("you got yelled at later").

Return only valid JSON matching the tool schema. Do not chat. Do not explain. Do not preface.`;

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

  // Confirm the thread is a partnership thread; personal threads we leave
  // alone for now.
  const { data: thread, error: tErr } = await supabase
    .from("threads")
    .select("id, kind, partnership_id")
    .eq("id", msg.thread_id)
    .single();
  if (tErr || !thread || thread.kind !== "partnership") {
    return new Response("not a partnership thread", { status: 200 });
  }

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
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "decide",
          description:
            "Decide whether to echo this message back to the sender as a structured ack, or to stay silent.",
          input_schema: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["burst", "direct"],
                description:
                  "burst = items to echo back; direct = stay silent, message rides through",
              },
              items: {
                type: "array",
                items: { type: "string" },
                description:
                  "If burst: 1-6 short item phrases in order. If direct: empty.",
              },
              ack: {
                type: "string",
                description:
                  "If burst: the full ack string starting with 'Got it — ' and ending with ' Sound right?'. If direct: empty string.",
              },
            },
            required: ["kind", "items", "ack"],
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
    kind: "burst" | "direct";
    items: string[];
    ack: string;
  };

  if (decision.kind === "direct" || !decision.ack.trim()) {
    // Stay silent. The human message already rides through.
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
