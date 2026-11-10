// send-push: event pushes, called by Postgres triggers (pg_net) for new
// messages, cards landing on someone, and card status changes. Delivery,
// levels and logging live in _shared/push.ts; the twice-daily rundown is
// send-rundown.
//
// Buzz (active) only for things that give you a reason to open the app: your
// partner's own words, things landing on your list, a question for you.
// Acknowledgements ("Jake's got it", "Jake handled it") and agent talk arrive
// silently; the rundown is where those pay off. Nobody is pushed about their
// own action.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { type Alert, firstNameOf, type Level, pushToUser } from "../_shared/push.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// --- types ---
// Three payload shapes:
// 1. The messages-INSERT webhook (pg_net trigger on every new message).
// 2. CARDS_ASSIGNED — a burst just landed items on a partner ("waiting on
//    you"), fired by the ops_cards statement trigger.
// 3. CARD_EVENT — a batch of cards was done / accepted / passed, fired by
//    drain_pending_announcements once per recipient.
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
    // Otis's running "Jake's got / done / passed" lines. CARD_EVENT pushes
    // cover those, so the line itself never pushes.
    summary_key?: string | null;
    // Agent relay sent for this person (clarify_ops_card): they aren't
    // pushed, and the push to their partner is active.
    on_behalf_of?: string | null;
  };
};
type CardsPayload = {
  type: "CARDS_ASSIGNED";
  owner_id: string;
  source_user_id: string;
  thread_id: string;
  titles: string[];
};
type CardEventPayload = {
  type: "CARD_EVENT";
  event: "done" | "accepted" | "passed";
  actor_id: string;
  recipient_id: string;
  thread_id: string;
  titles: string[];
};
type WebhookPayload = MessagePayload | CardsPayload | CardEventPayload;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

// "Eli pickup, Diapers, +1 more"
function titleList(titles: string[]): string {
  const shown = titles.slice(0, 3).join(", ");
  return titles.length > 3 ? `${shown} +${titles.length - 3} more` : shown;
}

// --- "Waiting on you": items just landed on a partner ---
async function handleCardsAssigned(p: CardsPayload): Promise<Response> {
  if (!p.owner_id || p.owner_id === p.source_user_id || !p.titles?.length) {
    return json({ sent: 0 });
  }
  const sender = await firstNameOf(supabase, p.source_user_id);
  const n = p.titles.length;
  const alert = {
    title: `✅ ${sender} put ${n === 1 ? "something" : `${n} things`} on your list`,
    body: titleList(p.titles),
  };
  return json(
    await pushToUser(supabase, p.owner_id, alert, "active", {
      kind: "cards_assigned",
      threadId: p.thread_id,
    }),
  );
}

// --- Card status batches ---
async function handleCardEvent(p: CardEventPayload): Promise<Response> {
  if (!p.recipient_id || p.recipient_id === p.actor_id || !p.titles?.length) {
    return json({ sent: 0 });
  }
  const actor = await firstNameOf(supabase, p.actor_id);
  const n = p.titles.length;
  let alert: Alert;
  let level: Level;
  if (p.event === "done") {
    // Complete on the lock screen, so it doesn't earn a buzz. The rundown's
    // "Handled" section is where it pays off.
    alert = {
      title: n === 1 ? `✓ ${actor} handled it` : `✓ ${actor} handled ${n} of your things`,
      body: titleList(p.titles),
    };
    level = "passive";
  } else if (p.event === "accepted") {
    alert = {
      title: n === 1 ? `${actor}'s got it` : `${actor}'s got ${n} of your things`,
      body: titleList(p.titles),
    };
    level = "passive";
  } else if (p.event === "passed") {
    // Something just landed on you: same weight as CARDS_ASSIGNED.
    alert = {
      title: `✅ ${actor} passed ${n === 1 ? "something" : `${n} things`} to you`,
      body: titleList(p.titles),
    };
    level = "active";
  } else {
    return json({ sent: 0, note: "unknown event" });
  }
  return json(
    await pushToUser(supabase, p.recipient_id, alert, level, {
      kind: `card_${p.event}`,
      threadId: p.thread_id,
    }),
  );
}

// --- New message in a thread ---
async function handleMessage(msg: MessagePayload["record"]): Promise<Response> {
  if (msg.summary_key) return json({ sent: 0, note: "summary line" });

  const { data: thread } = await supabase
    .from("threads")
    .select("id, kind, partnership_id, owner_id")
    .eq("id", msg.thread_id)
    .single();
  if (!thread) return json({ sent: 0, note: "thread not found" });

  // Whoever the message is from (or relayed for) is never a recipient.
  const fromUserId = msg.author_user_id ?? msg.on_behalf_of ?? null;
  let recipientIds: string[] = [];
  if (thread.kind === "partnership" && thread.partnership_id) {
    const { data: members } = await supabase
      .from("partnership_members")
      .select("user_id")
      .eq("partnership_id", thread.partnership_id);
    recipientIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== fromUserId);
  } else if (thread.kind === "personal" && thread.owner_id) {
    // Personal threads only push to the owner, and not for their own typing.
    if (thread.owner_id !== fromUserId) recipientIds = [thread.owner_id];
  }
  if (recipientIds.length === 0) return json({ sent: 0 });

  // Emoji-coded titles — iOS doesn't allow custom banner colors, so the
  // emoji IS the color. 💚 = your partner (the green of the partnership),
  // 🟢 = Otis, 🟣 = Mira. Voice rule per UX_SPEC §8.4: Mira for you-alone,
  // Otis for shared rooms.
  let title = "Guildenstern";
  let level: Level;
  let kind: string;
  if (msg.author_kind === "agent") {
    title = thread.kind === "personal" ? "🟣 Mira" : "🟢 Otis";
    // A relay is your partner asking you something: buzz. Otherwise the
    // agent is talking, which can wait.
    level = msg.on_behalf_of ? "active" : "passive";
    kind = msg.on_behalf_of ? "agent_relay" : "agent";
  } else {
    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", msg.author_user_id)
      .single();
    if (sender?.name) title = `💚 ${sender.name}`;
    level = "active";
    kind = "message";
  }
  const alert = {
    title,
    body: msg.body.length > 160 ? msg.body.slice(0, 157) + "…" : msg.body,
  };

  const results = await Promise.all(
    recipientIds.map((rid) =>
      pushToUser(supabase, rid, alert, level, { kind, threadId: msg.thread_id })
    ),
  );
  return json({
    sent: results.reduce((s, r) => s + r.sent, 0),
    failed: results.reduce((s, r) => s + r.failed, 0),
  });
}

// --- handler ---
Deno.serve(async (req) => {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (payload.type === "CARDS_ASSIGNED") return await handleCardsAssigned(payload);
  if (payload.type === "CARD_EVENT") return await handleCardEvent(payload);
  if (payload.type === "INSERT" && payload.record) return await handleMessage(payload.record);
  return new Response("unknown payload", { status: 400 });
});
