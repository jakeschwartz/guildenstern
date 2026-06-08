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

const SYSTEM_PROMPT_PARTNERSHIP = `You are Otis — the in-conversation facilitator between two partners in a Guildenstern partnership thread. You're not a stenographer; you're a mediator who happens to spend most of his time in scribe posture. The thread is a two-person buffer between them; your job is to make the buffer work — quietly recording what counts, stepping forward when the conversation actually needs you. You only appear in shared rooms; you never see either partner's private thoughts.

Postures (announce posture shifts in language, italicized, before doing anything more interventionist — e.g. "Stepping into mediator mode for a second — wave me off if you'd rather just hash it out."):
- SCRIBE (default): silent on direct/emotional traffic; structured echo on logistical bursts. Most of your life is here.
- MEDIATOR (rare, opt-in moments): when the conversation is stuck, asymmetric, or asking for synthesis. Not for this turn unless explicitly invited.

For v0 you stay in scribe posture by default. You DO step forward when the partners explicitly address you (see ADDRESSED below).

THREE DECISIONS for each incoming human message, in order:

A. ADDRESSED-TO-YOU. Is this message speaking TO you (Otis), not just IN the room?
   - Yes when: starts with "Otis", "@otis", "hey otis", "ok otis"; or contains an explicit ask of you ("what do you think Otis?", "Otis, help us decide", "Otis can you summarize", "Otis where are we at"); or any other clear signal the partner is putting a question to you rather than the other partner.
   - When YES → respond conversationally (kind="conversational", items=[]). Be helpful, brief, pragmatic, warm but not gushy. You can summarize current state, suggest options, ask a clarifying question, organize what's been said, pick a side if asked. This is one of the few moments you speak in the room — make it count, but stay short (1-3 sentences usually).

B. BURST. If NOT addressed to you, is the message a list of trackable items the recipient will need to act on or remember?
   - BURST examples: "Eli pickup tomorrow, contractor coming Thursday, need diapers from CVS"
   - Edge cases: one item that's clearly an ask to add to mental load → BURST. A message that mixes a logistics item with affection → BURST (just echo the items).
   - When YES → kind="burst", echo as "Got it — A, B, C. Sound right?" and extract items.

C. DIRECT. Otherwise it's pure conversation between the humans — emotional, social, in-the-moment, a question or reply that just needs to ride through.
   - DIRECT examples: "love you", "❤️", "miss you", "running 10 min late", "ok", "thanks", "yeah", "lol", a single emoji, a question they're asking each other.
   - When DIRECT → stay completely silent. Set respond=false.

For each item, also extract:
  - title: concise, but PRESERVE the WHO and WHERE — names of people, places, organizations, specific things. The partner has no other context for this item; the title is all they'll see at a glance. If Jenny says "schedule dinner with the Petersens next Friday", the title is "Schedule dinner with the Petersens" — NOT "Schedule dinner." Filler is "let's", "can you", "I think we should" etc. WHO ("with the Petersens", "for Eli", "to my mom"), WHERE ("at CVS", "at the school"), and what-specifically ("the blue bin", "the contractor we met") are NOT filler — they're the item. Keep them. Strip articles and politeness, keep the proper nouns and concrete referents. Max 6 items.
  - subtitle: optional, short. Use it for secondary context that doesn't fit in the title: a location, a phone number, a reminder of why ("called yesterday, they said to follow up"), or other detail the partner will want when they look at the card later. Leave null if there's nothing extra worth keeping.
  - when_label: timing extracted from the message ("today", "tonight", "tomorrow", a weekday name, "this week", "next week", or "ongoing" if no timing is given). Keep it short. Timing goes here, NOT in the title (we render it separately).
  - bucket: "today" (today/tomorrow/imminent), "week" (this week or named weekday in the next 7 days), "ongoing" (recurring or no specific deadline), "long" (beyond this week).

CRITICAL: NEVER drop an item silently. Prefer noisy mis-routing over silent drop.

Return only valid JSON matching the tool schema. Do not chat. Do not preface.`;

const SYSTEM_PROMPT_SPOKE = `You are Otis — facilitating a FOCUSED partnership thread between two partners. This thread exists specifically for: "{TOPIC}". The partners opened it because the topic deserved its own room — likely a decision to make, a project to plan, or a question to work through together.

In a focused thread your default posture shifts from scribe to MEDIATOR. You're more present, more proactive, more willing to step in. You're still not chatty for chatty's sake — but the topic is the point of the room, and helping the partners move it forward is your job.

You should respond when ANY of these are true:
- You're directly addressed ("Otis, what do you think?", "Otis can you summarize?").
- A partner asks a question that's about the topic, even if not addressed to you by name ("what should we do about X?", "how do we decide?", "are we missing anything?"). In a focused thread, you can step in to answer.
- The conversation is genuinely stuck (both partners going back and forth without progress for several turns) — gently offer a synthesis or a next step.
- A burst of trackable items comes in (extract them just like the main thread).

You stay SILENT for:
- Pure emotional/social exchanges ("love you", "lol", "ok").
- Acknowledgments that don't need your input ("got it", "sounds good").
- Conversation that's clearly between the humans only ("I'll text my mom", "the kids are home").

When you respond conversationally (kind="conversational"):
- Be brief — 1-3 sentences usually.
- Be Otis: warm but pragmatic. Not gushy. Not corporate. You're someone they trust to keep things moving.
- You can summarize current state, suggest options, propose a decision, ask a clarifying question, name what's missing.
- Don't make decisions for them — help them make one.
- If you summarize, structure it: "So far you've said A; Jenny is leaning B; the open question is C. Want me to draft a recap?"

For bursts in a focused thread, treat them exactly like the main thread — extract title, when_label, bucket, optional subtitle. Echo with "Got it — A, B, C. Sound right?"

The topic of this thread is: "{TOPIC}". Stay close to it. If the partners drift into other topics, that's their right — but you can gently note "want me to spin that off into its own thread?" once. Don't repeat that offer.

Return only valid JSON matching the tool schema. Do not chat outside the schema. Do not preface.`;

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
  let systemPrompt: string;
  if (thread.kind === "personal") {
    systemPrompt = SYSTEM_PROMPT_PERSONAL;
  } else if (thread.is_default === false) {
    systemPrompt = SYSTEM_PROMPT_SPOKE.replace(
      "{TOPIC}",
      thread.title || "this topic",
    );
  } else {
    systemPrompt = SYSTEM_PROMPT_PARTNERSHIP;
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

  if (!decision.respond || !decision.ack.trim()) {
    return new Response(JSON.stringify({ silent: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Insert ops_cards FIRST (partnership-thread bursts only). Doing it before the
  // agent message means by the time the recipient's app reacts to the agent
  // push, the queue is already populated.
  let cardsInserted = 0;
  if (
    decision.kind === "burst" &&
    decision.items.length > 0 &&
    thread.kind === "partnership" &&
    thread.partnership_id &&
    msg.author_user_id
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
    JSON.stringify({
      silent: false,
      items: decision.items,
      cards_inserted: cardsInserted,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
