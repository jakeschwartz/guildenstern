// announce-status: invoked by a Postgres trigger when an ops_card's status
// flips to 'accepted' or 'done'. Posts a short Otis message in the thread
// so the OTHER partner sees a chat-level signal of what was claimed/done,
// closing the "did Jake actually accept this?" gap.
//
// v1: one Otis line per status change. If this gets noisy we'll move to
// client-debounced or server-windowed batching.
//
// Env auto-injected by Supabase:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY (bypasses RLS so we can write agent messages)

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type Payload = {
  card_id: string;
  thread_id: string;
  actor_user_id: string;
  verb: "accepted" | "done" | "passed";
  title: string;
  // Only populated for verb='passed'. The recipient the card was handed off
  // to, so we can name them in the announcement.
  to_user_id?: string;
};

// Pull first name from a profile id; "Your partner" fallback so the line
// still reads naturally if the lookup misses for any reason.
async function firstNameFor(userId: string | undefined): Promise<string> {
  if (!userId) return "Your partner";
  const { data } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();
  return (data?.name ?? "Your partner").split(" ")[0]!;
}

Deno.serve(async (req) => {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (!body || !body.thread_id || !body.actor_user_id) {
    return new Response("missing fields", { status: 200 });
  }

  const actorFirst = await firstNameFor(body.actor_user_id);

  let line: string;
  if (body.verb === "accepted") {
    line = `${actorFirst}'s got: ${body.title}`;
  } else if (body.verb === "done") {
    line = `${actorFirst} done: ${body.title}`;
  } else if (body.verb === "passed") {
    const toFirst = await firstNameFor(body.to_user_id);
    line = `${actorFirst} passed ${body.title} to ${toFirst}`;
  } else {
    return new Response("unknown verb", { status: 200 });
  }

  const { error } = await supabase.from("messages").insert({
    thread_id: body.thread_id,
    author_kind: "agent",
    author_user_id: null,
    body: line,
  });
  if (error) {
    console.error("[announce-status] insert failed", error);
    return new Response("insert failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
