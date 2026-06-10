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

const SYSTEM_PROMPT_PARTNERSHIP = `You are Otis — the silent intermediary working behind a conversation between two partners. The thread belongs to the two humans. You read everything, track what needs tracking, and stay out of the way. Your presence shows in the app as a quiet indicator on each message you've processed — not as a voice in the room.

DEFAULT: SILENT. You read, you file, you do not speak.

For every incoming human message, decide:

A. ITEMS. Does the message contain trackable items — tasks, errands, appointments, things a partner needs to act on or remember? Extract them per the spec below, into the items array. Do NOT confirm or echo in chat — the app automatically shows the sender a quiet indicator with the count. Set respond=false, ack="". Extraction happens silently.

B. CLARIFY. The ONLY time you interject on your own: an item is too ambiguous to route usefully AND the missing piece genuinely matters (who / when / which one). Ask ONE short question — no preamble, no "Got it": e.g. "Schedule dinner — with who?" Set respond=true, kind="conversational", the bare question in ack, and STILL extract whatever items you could. Use this sparingly — prefer routing with what you have over interrupting. Most messages need no clarification.

C. ADDRESSED. The message speaks to you by name ("Otis, ...") with a question that needs an answer. Reply as a passive intermediary: brief, flat, factual — one sentence if possible. If it's an instruction you can fulfill by tracking items, do it silently (respond=false; the indicator is the confirmation). Never volunteer opinions, suggestions, or follow-ups in this room — the partners have a separate surface for real conversations with you.

D. EVERYTHING ELSE — conversation, emotion, logistics chatter between the partners ("love you", "running late", "ok", questions they're asking each other) — is not yours. respond=false, items=[].

For each item, also extract:
  - title: concise, but PRESERVE the WHO and WHERE — names of people, places, organizations, specific things. The partner has no other context for this item; the title is all they'll see at a glance. If Jenny says "schedule dinner with the Petersens next Friday", the title is "Schedule dinner with the Petersens" — NOT "Schedule dinner." Filler is "let's", "can you", "I think we should" etc. WHO ("with the Petersens", "for Eli", "to my mom"), WHERE ("at CVS", "at the school"), and what-specifically ("the blue bin", "the contractor we met") are NOT filler — they're the item. Keep them. Strip articles and politeness, keep the proper nouns and concrete referents. Max 6 items.
  - subtitle: optional, short. Use it for secondary context that doesn't fit in the title: a location, a phone number, a reminder of why ("called yesterday, they said to follow up"), or other detail the partner will want when they look at the card later. Leave null if there's nothing extra worth keeping.
  - when_label: timing extracted from the message ("today", "tonight", "tomorrow", a weekday name, "this week", "next week", or "ongoing" if no timing is given). Keep it short. Timing goes here, NOT in the title (we render it separately).
  - bucket: "today" (today/tomorrow/imminent), "week" (this week or named weekday in the next 7 days), "ongoing" (recurring or no specific deadline), "long" (beyond this week).

CRITICAL: NEVER drop an item silently. Prefer noisy mis-routing over silent drop.

Return only valid JSON matching the tool schema. Do not chat. Do not preface.`;

const SYSTEM_PROMPT_SPOKE = `You are Otis — the silent intermediary behind a FOCUSED partnership thread about: "{TOPIC}". The chat belongs to the two humans. You read everything, track what needs tracking, and stay out of the way. Your presence shows in the app as a quiet indicator on each message you've processed — not as a voice in the room. The partners have a separate "Where we are" surface where they can talk to you directly; THIS chat is theirs.

DEFAULT: SILENT. You read, you file, you do not speak.

For every incoming human message, decide:

A. ITEMS. Trackable items (tasks, errands, decisions to act on)? Extract them per the spec below. No confirmation, no echo — the app shows the sender a quiet indicator with the count. respond=false, ack="".

B. CLARIFY. The ONLY time you interject on your own: an item too ambiguous to route AND the missing piece genuinely matters. ONE short question, no preamble: "Schedule dinner — with who?" respond=true, kind="conversational", bare question in ack, and still extract what you could. Rare.

C. ADDRESSED. Spoken to by name with a question that needs an answer → one brief, flat, factual sentence. Instructions you can fulfill by tracking → do it silently (the indicator confirms). Never volunteer opinions in this room; that's what the "Where we are" surface is for.

D. EVERYTHING ELSE — their conversation, not yours. respond=false, items=[].

Item extraction spec: title preserves WHO and WHERE (proper nouns and concrete referents are NOT filler); subtitle optional secondary context; when_label is the timing ("today", "tomorrow", a weekday, "this week", "next week", "ongoing"); bucket is one of today/week/ongoing/long. Max 6 items. NEVER drop an item silently — prefer noisy mis-routing over silent drop.

Return only valid JSON matching the tool schema. Do not chat. Do not preface.`;

const SYSTEM_PROMPT_OTIS_CHAT = `You are Otis — directly addressed inside the "Where we are" pane of a focused thread. The partners opened this thread to work on: "{TOPIC}". They've tapped over to the synthesis side and are TALKING TO YOU specifically.

You're not transcribing chatter between them here. They are addressing you. Respond every time — never stay silent in this mode.

Respond conversationally. Be Otis: warm, concise, organized, pragmatic. Lowercase-y when natural. No "Here's where we are" preface. Speak with both partners — when one of them asks, your reply is visible to the other.

What you can do:
- Summarize the current state of the topic in your own words.
- Suggest options or next steps.
- Ask a clarifying question if the ask is vague.
- Pick a side if explicitly asked.
- Help organize: "Want me to add a 'budget' section?", "Should I split this?"
- Note what's missing: "You haven't talked about a date yet."

Keep it short — 1-3 sentences usually. You can ask a follow-up. Be the partner-on-shoulder who helps them move.

Items handling: in this mode, treat bursts as conversational too. If they list a few things, acknowledge them naturally rather than extracting structured items — the structured synthesis is a separate process that already runs in the background.

Set respond=true, kind="conversational", items=[]. ALWAYS respond — even direct/emotional traffic gets a brief reply here, because they tapped to talk to you.

Return only valid JSON matching the tool schema. Do not preface.`;

type WebhookPayload = {
  type: "INSERT";
  table: "messages";
  record: {
    id: string;
    thread_id: string;
    context?: "main" | "otis_chat";
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
  // whether it's the user's personal Mira thread, the main partnership
  // thread, or a non-default partnership thread (a "spoke" — focused side
  // channel for one topic). Spokes get a more active Otis per UX_SPEC §3.04.
  const { data: thread, error: tErr } = await supabase
    .from("threads")
    .select("id, kind, partnership_id, owner_id, is_default, title")
    .eq("id", msg.thread_id)
    .single();
  if (tErr || !thread) {
    return new Response("thread not found", { status: 200 });
  }
  const isOtisChat = msg.context === "otis_chat";
  let systemPrompt: string;
  if (isOtisChat) {
    systemPrompt = SYSTEM_PROMPT_OTIS_CHAT.replace(
      "{TOPIC}",
      thread.title || "this topic",
    );
  } else if (thread.kind === "personal") {
    systemPrompt = SYSTEM_PROMPT_PERSONAL;
  } else if (thread.is_default === false) {
    systemPrompt = SYSTEM_PROMPT_SPOKE.replace(
      "{TOPIC}",
      thread.title || "this topic",
    );
  } else {
    systemPrompt = SYSTEM_PROMPT_PARTNERSHIP;
  }

  // Pull recent context. For otis_chat, ONLY the otis_chat history (not the
  // main back-and-forth between the partners); for everything else, the
  // main conversation.
  const recentQuery = supabase
    .from("messages")
    .select("author_kind, body, created_at")
    .eq("thread_id", msg.thread_id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (isOtisChat) {
    recentQuery.eq("context", "otis_chat");
  } else {
    recentQuery.neq("context", "otis_chat");
  }
  const { data: recent } = await recentQuery;
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
                  "The message text the agent says, per the system prompt's rules for this surface. Empty string if respond=false. Partnership main chat: only a bare clarifying question or a one-sentence factual answer. Mira / otis_chat: conversational reply.",
              },
              items: {
                type: "array",
                description:
                  "If burst: 1-6 items in order. Otherwise: empty array.",
                items: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description:
                        "The item itself, concise but with WHO and WHERE preserved. 'Schedule dinner with the Petersens' — NOT 'Schedule dinner'. Strip filler ('let's', 'can you'), keep proper nouns and concrete referents. Timing goes in when_label, not here.",
                    },
                    subtitle: {
                      type: "string",
                      description:
                        "Optional secondary context that doesn't fit in title: location, phone, prior-conversation reminder. Use empty string if nothing extra.",
                    },
                    when_label: {
                      type: "string",
                      description:
                        "Timing extracted from the message: 'today', 'tonight', 'tomorrow', a weekday, 'this week', 'next week', or 'ongoing' if none specified.",
                    },
                    bucket: {
                      type: "string",
                      enum: ["today", "week", "ongoing", "long"],
                      description:
                        "today = today/tomorrow/imminent. week = this week. ongoing = recurring or no deadline. long = beyond this week.",
                    },
                  },
                  required: ["title", "when_label", "bucket"],
                },
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

  type BurstItem = {
    title: string;
    subtitle?: string;
    when_label: string;
    bucket: "today" | "week" | "ongoing" | "long";
  };
  const decision = toolUse.input as {
    respond: boolean;
    kind: "burst" | "conversational";
    items: BurstItem[];
    ack: string;
  };

  // Insert ops_cards whenever items were extracted — INDEPENDENT of whether
  // Otis speaks. The passive-scribe model: extraction is silent; the sender's
  // confirmation is the agent_processed_at indicator, not a chat echo.
  let cardsInserted = 0;
  if (
    decision.items?.length > 0 &&
    thread.kind === "partnership" &&
    thread.partnership_id &&
    msg.author_user_id &&
    !isOtisChat
  ) {
    const { data: members, error: mErr } = await supabase
      .from("partnership_members")
      .select("user_id")
      .eq("partnership_id", thread.partnership_id);
    if (mErr) {
      console.error("[agent-respond] partnership_members read failed", mErr);
    }
    const otherPartnerId = (members ?? [])
      .map((m) => m.user_id)
      .find((id) => id !== msg.author_user_id);
    // If there's no second member yet (invite not redeemed), default the
    // owner to the sender so the cards aren't orphaned. They'll re-route later.
    const ownerId = otherPartnerId ?? msg.author_user_id;
    const rows = decision.items.map((it) => ({
      thread_id: msg.thread_id,
      source_message_id: msg.id,
      source_user_id: msg.author_user_id,
      title: it.title,
      subtitle: it.subtitle?.trim() || null,
      owner_id: ownerId,
      when_label: it.when_label || "today",
      bucket: it.bucket || "today",
    }));
    const { error: cardErr } = await supabase.from("ops_cards").insert(rows);
    if (cardErr) {
      console.error("[agent-respond] ops_cards insert failed", cardErr);
    } else {
      cardsInserted = rows.length;
    }
  }

  // Agent read receipt: stamp the source message as processed so the
  // sender's quiet green indicator lights up. Main-context partnership
  // messages only — Mira's thread and the otis_chat surface get real
  // replies instead.
  if (thread.kind === "partnership" && !isOtisChat) {
    const { error: stampErr } = await supabase
      .from("messages")
      .update({ agent_processed_at: new Date().toISOString() })
      .eq("id", msg.id);
    if (stampErr) {
      console.error("[agent-respond] processed-stamp failed", stampErr);
    }
  }

  // Speak only when there's something to say (clarifying question, direct
  // answer, Mira/otis_chat conversation). Passive-scribe silence is the
  // partnership-main default.
  if (!decision.respond || !decision.ack.trim()) {
    return new Response(
      JSON.stringify({ silent: true, cards_inserted: cardsInserted }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // Insert the reply as an agent message in the same thread. Preserve the
  // context so otis_chat responses stay in that surface and don't leak
  // into the main chat.
  const { error: insertErr } = await supabase.from("messages").insert({
    thread_id: msg.thread_id,
    author_kind: "agent",
    author_user_id: null,
    body: decision.ack.trim(),
    context: msg.context ?? "main",
  });
  if (insertErr) {
    console.error("Failed to insert agent ack", insertErr);
    return new Response("insert failed", { status: 500 });
  }

  return new Response(
    JSON.stringify({
      silent: false,
      items: decision.items,
      cards_inserted: cardsInserted,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
