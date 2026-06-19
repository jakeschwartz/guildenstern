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

THREAD SETUP: sometimes the user asks you to set up / start / make / spin up a thread or a space for a topic or project — usually to coordinate it with their partner ("set up a thread for me and Jenny to plan the trip", "can we make a thread for the kitchen reno"). When they do, don't create it silently and don't just ack — propose a SHARED thread with their partner that they confirm with one tap. Set setup_thread=true, give a short setup_thread_title (2-4 words, e.g. "Italy trip"), and a one-line setup_thread_reason. Also set respond=true, kind="conversational", items=[] (do NOT extract items — the topic moves to the new thread), and write a brief ack offering to open it ("Want me to open a shared thread with Jenny for that?"). Only do this when they're clearly asking for a dedicated space for an ongoing thing (a trip, a project, a recurring topic) — not for a single quick task, which you just ack normally. You only ever propose shared threads with the partner this way; you never silently create one, and you don't make private side-threads.

Return only valid JSON matching the tool schema. Do not chat outside the schema. Do not preface.`;

const SYSTEM_PROMPT_PARTNERSHIP = `You are Otis — the in-conversation facilitator between two partners in a Guildenstern partnership thread. You're not a stenographer; you're a mediator who happens to spend most of his time in scribe posture. The thread is a two-person buffer between them; your job is to make the buffer work — quietly recording what counts, stepping forward when the conversation actually needs you. You only appear in shared rooms; you never see either partner's private thoughts.

Postures (announce posture shifts in language, italicized, before doing anything more interventionist — e.g. "Stepping into mediator mode for a second — wave me off if you'd rather just hash it out."):
- SCRIBE (default): silent on direct/emotional traffic; structured echo on logistical bursts. Most of your life is here.
- MEDIATOR (rare, opt-in moments): when the conversation is stuck, asymmetric, or asking for synthesis. Not for this turn unless explicitly invited.

For v0 you stay in scribe posture. Do not volunteer mediator mode yet.

CRITICAL DECISION you make on every incoming human message: is this a BURST (trackable items the recipient will need to act on or remember), or a DIRECT message (emotional, conversational, or a single in-the-moment reply that should ride through untouched)?

- DIRECT examples: "love you", "❤️", "miss you", "running 10 min late", "ok", "thanks", "yeah", "lol", a single emoji, a question that just needs an answer right now
- BURST examples: "Eli pickup tomorrow, contractor coming Thursday, need diapers from CVS"
- Edge cases: a message with one item that is clearly an ask to add it to mental load → BURST. A message that mixes a logistics item with affection → BURST (just echo the items).

If DIRECT, you stay completely silent. Do not respond.

If BURST, you respond with a structured echo in the partner's voice. Format: "Got it — A, B, C. Sound right?" — verbatim ending.

OFF-TOPIC JUDGMENT: occasionally a message opens a whole separate project or subject that doesn't belong in this thread's day-to-day flow — planning a vacation, a home renovation, a big purchase decision — dropped into a thread that's otherwise about daily logistics. When you are confident a message is WILDLY off-topic for this thread and deserves its own dedicated thread, set off_topic=true, give a short suggested_thread_title (2-4 words, e.g. "Italy trip"), and a one-line off_topic_reason. Be conservative — this is rare. Only flag clear, high-confidence cases, never an ordinary tangent or a single stray item. When you flag off_topic: set respond=true, kind="conversational", items=[] (do NOT extract items into this thread — they'll be handled once the message is moved), and write a brief ack noting it feels like its own thing (do NOT echo the items). You never create the thread yourself — you only propose; the partners confirm.

For each item, also extract:
  - title: short noun phrase, in order, max 6 items. Strip filler. Keep critical timing in the title only if it reads naturally ("call contractor Thursday" → title "call contractor", when_label "Thursday").
  - when_label: timing extracted from the message ("today", "tonight", "tomorrow", a weekday name, "this week", "next week", or "ongoing" if no timing is given). Keep it short.
  - bucket: "today" (today/tomorrow/imminent), "week" (this week or named weekday in the next 7 days), "ongoing" (recurring or no specific deadline), "long" (beyond this week).

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
                description:
                  "If burst: 1-6 items in order. Otherwise: empty array.",
                items: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description:
                        "Short noun phrase. Strip filler. Keep timing in when_label, not here.",
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
              off_topic: {
                type: "boolean",
                description:
                  "PARTNERSHIP THREADS ONLY. true only when the latest message is wildly off-topic for this thread — a distinct project/subject deserving its own thread. Be conservative; default false. When true: respond=true, kind='conversational', items=[].",
              },
              suggested_thread_title: {
                type: "string",
                description:
                  "If off_topic: a short 2-4 word title for the proposed new thread (e.g. 'Italy trip'). Else empty string.",
              },
              off_topic_reason: {
                type: "string",
                description:
                  "If off_topic: one short sentence on why this belongs in its own thread. Else empty string.",
              },
              setup_thread: {
                type: "boolean",
                description:
                  "PERSONAL (Mira) THREADS ONLY. true only when the user is asking you to set up / start / make a dedicated thread for a topic or project (usually to coordinate with their partner). Default false. When true: respond=true, kind='conversational', items=[].",
              },
              setup_thread_title: {
                type: "string",
                description:
                  "If setup_thread: a short 2-4 word title for the proposed shared thread (e.g. 'Italy trip'). Else empty string.",
              },
              setup_thread_reason: {
                type: "string",
                description:
                  "If setup_thread: one short sentence on what the shared thread is for. Else empty string.",
              },
            },
            required: [
              "respond",
              "kind",
              "ack",
              "items",
              "off_topic",
              "suggested_thread_title",
              "off_topic_reason",
              "setup_thread",
              "setup_thread_title",
              "setup_thread_reason",
            ],
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
    when_label: string;
    bucket: "today" | "week" | "ongoing" | "long";
  };
  const decision = toolUse.input as {
    respond: boolean;
    kind: "burst" | "conversational";
    items: BurstItem[];
    ack: string;
    off_topic?: boolean;
    suggested_thread_title?: string;
    off_topic_reason?: string;
    setup_thread?: boolean;
    setup_thread_title?: string;
    setup_thread_reason?: string;
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
      subtitle: null,
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

  // Insert the structured echo as an agent message in the same thread. If Otis
  // flagged the message as off-topic (partnership threads only), attach the
  // thread-suggestion payload in client shape so the app renders the actionable
  // "move this to its own thread" callout. Suggest-only — nothing is created
  // server-side; a partner confirms in the UI.
  const agentMsg: Record<string, unknown> = {
    thread_id: msg.thread_id,
    author_kind: "agent",
    author_user_id: null,
    body: decision.ack.trim(),
  };
  const offTopic =
    thread.kind === "partnership" &&
    decision.off_topic === true &&
    !!decision.suggested_thread_title?.trim();
  if (offTopic) {
    agentMsg.thread_suggestion = {
      suggestedTitle: decision.suggested_thread_title!.trim(),
      reason: decision.off_topic_reason?.trim() ?? "",
      sourceMessageIds: [msg.id],
      status: "open",
    };
  }

  // Mira (personal thread): the user asked her to set up a shared thread.
  // Same suggest-then-confirm payload, but no source message to move — it's a
  // fresh thread the client creates against the user's partnership on accept.
  // Only offer it when the user actually has a partner; otherwise there's no
  // shared room to make, so Mira just acks conversationally.
  let setupThread = false;
  if (
    thread.kind === "personal" &&
    decision.setup_thread === true &&
    !!decision.setup_thread_title?.trim() &&
    thread.owner_id &&
    !offTopic
  ) {
    const { data: memberships } = await supabase
      .from("partnership_members")
      .select("partnership_id")
      .eq("user_id", thread.owner_id)
      .limit(1);
    if (memberships && memberships.length > 0) {
      setupThread = true;
      agentMsg.thread_suggestion = {
        suggestedTitle: decision.setup_thread_title!.trim(),
        reason: decision.setup_thread_reason?.trim() ?? "",
        sourceMessageIds: [],
        status: "open",
      };
    }
  }

  const { error: insertErr } = await supabase.from("messages").insert(agentMsg);
  if (insertErr) {
    console.error("Failed to insert agent ack", insertErr);
    return new Response("insert failed", { status: 500 });
  }

  return new Response(
    JSON.stringify({
      silent: false,
      items: decision.items,
      cards_inserted: cardsInserted,
      off_topic: offTopic,
      setup_thread: setupThread,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
