// send-rundown: Mira's twice-daily push. compose.ts drafts the variants and
// picks one; this file gathers each person's data, enforces the rules, sends,
// and records the run.
//
// Two ways in:
//   Scheduled — pg_cron calls with no user token every 15 minutes. Anyone whose
//     local time is in a slot (8–10am, 8–10pm) and hasn't had that slot today
//     gets a run: skipped if they opened the app in the last 2 hours or there's
//     nothing real to say, otherwise one push. Every run is claimed in
//     rundown_runs first, so a slot can't fire twice.
//   Test — called from the app with the user's own token ("Send me a test
//     rundown" in the menu). Sends that user a rundown now, logged as
//     rundown_test so it never counts toward the experiment.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { getValidGoogleAccessToken } from "../_shared/google_token.ts";
import { firstNameOf, pushToUser } from "../_shared/push.ts";
import {
  type CardFact,
  draftCandidates,
  type EventFact,
  pickCandidate,
  PUSH_TITLE,
  type RundownInput,
  type SentRundown,
  type Slot,
} from "./compose.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const DEFAULT_TZ = "America/New_York";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ACTIVE_SKIP_MS = 2 * HOUR;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
const iso = (ms: number) => new Date(ms).toISOString();

// ---------- local time ----------

function validTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

function localParts(now: number, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(now)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function slotFor(hour: number): Slot | null {
  if (hour >= 8 && hour < 10) return "am";
  if (hour >= 20 && hour < 22) return "pm";
  return null;
}

// "9:30", "3"
function clock(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
    .format(new Date(ms))
    .replace(/\s?[AP]M$/i, "")
    .replace(/:00$/, "");
}

// ---------- data ----------

// Remaining timed events today from the user's primary Google Calendar.
// Empty when Google isn't connected or the call fails.
async function todaysEvents(userId: string, now: number, endOfDay: number): Promise<EventFact[]> {
  try {
    const token = await getValidGoogleAccessToken(supabase as any, userId);
    if (!token) return [];
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", iso(now));
    url.searchParams.set("timeMax", iso(endOfDay));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "20");
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: any[] };
    return (body.items ?? [])
      .filter((e) => e.status !== "cancelled" && e.start?.dateTime)
      .map((e) => ({ title: e.summary ?? "Event", start: Date.parse(e.start.dateTime) }));
  } catch (e) {
    console.error("[send-rundown] calendar fetch failed", e);
    return [];
  }
}

async function gather(
  userId: string,
  lastActiveAt: number,
  slot: Slot,
  tz: string,
  now: number,
): Promise<RundownInput> {
  const { data: memberships } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", userId);
  const partnershipIds = (memberships ?? []).map((m) => m.partnership_id as string);

  let partnerId: string | null = null;
  let threadIds: string[] = [];
  if (partnershipIds.length) {
    const { data: others } = await supabase
      .from("partnership_members")
      .select("user_id")
      .in("partnership_id", partnershipIds)
      .neq("user_id", userId)
      .limit(1);
    partnerId = (others?.[0]?.user_id as string | undefined) ?? null;
    const { data: threads } = await supabase
      .from("threads")
      .select("id")
      .eq("kind", "partnership")
      .in("partnership_id", partnershipIds);
    threadIds = (threads ?? []).map((t) => t.id as string);
  }

  const { data: personal } = await supabase
    .from("threads")
    .select("id")
    .eq("kind", "personal")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  let cards: CardFact[] = [];
  if (threadIds.length) {
    const { data: rows } = await supabase
      .from("ops_cards")
      .select("id, thread_id, title, owner_id, source_user_id, status, created_at, done_at, clarification")
      .in("thread_id", threadIds);
    cards = (rows ?? []).map((r: any) => ({
      id: r.id,
      threadId: r.thread_id,
      title: r.title,
      ownerId: r.owner_id,
      sourceUserId: r.source_user_id,
      status: r.status,
      createdAt: Date.parse(r.created_at),
      doneAt: r.done_at ? Date.parse(r.done_at) : null,
      clarification: r.clarification && typeof r.clarification === "object"
        ? {
          note: String(r.clarification.note ?? ""),
          askedByUserId: String(r.clarification.askedByUserId ?? ""),
          status: r.clarification.status === "open" ? "open" : "resolved",
        }
        : null,
    }));
  }

  const local = localParts(now, tz);
  const sinceMidnight = (local.hour * 60 + local.minute) * 60 * 1000;
  const events = slot === "am" ? await todaysEvents(userId, now, now + DAY - sinceMidnight) : [];

  const { count: invitations } = await supabase
    .from("push_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "rundown")
    .eq("variant", "invitation")
    .gte("sent_at", iso(now - 7 * DAY));

  return {
    userId,
    partnerId,
    partnerFirst: partnerId ? await firstNameOf(supabase as any, partnerId) : null,
    personalThreadId: (personal?.[0]?.id as string | undefined) ?? null,
    slot,
    sinceLastLook: Math.max(lastActiveAt, now - 2 * DAY),
    handledSince: slot === "am" ? now - DAY : now - sinceMidnight,
    cards,
    events,
    formatTime: (ms) => clock(ms, tz),
    invitationsThisWeek: invitations ?? 0,
  };
}

async function history(userId: string, now: number): Promise<{ sent: SentRundown[]; opens: number[] }> {
  const since = iso(now - 60 * DAY);
  const [{ data: sent }, { data: opens }] = await Promise.all([
    supabase
      .from("push_log")
      .select("variant, sent_at, opened_at")
      .eq("user_id", userId)
      .eq("kind", "rundown")
      .gte("sent_at", since),
    supabase
      .from("app_opens")
      .select("opened_at")
      .eq("user_id", userId)
      .gte("opened_at", since),
  ]);
  return {
    sent: (sent ?? [])
      .filter((r: any) => r.variant)
      .map((r: any) => ({
        variant: r.variant,
        sentAt: Date.parse(r.sent_at),
        openedAt: r.opened_at ? Date.parse(r.opened_at) : null,
      })),
    opens: (opens ?? []).map((r: any) => Date.parse(r.opened_at)),
  };
}

// ---------- one person ----------

type Outcome =
  | "not_due"
  | "already_ran"
  | "skipped_old_app"
  | "skipped_active"
  | "skipped_nothing"
  | "sent"
  | "failed";

async function runFor(
  userId: string,
  now: number,
  test: boolean,
): Promise<{ outcome: Outcome; variant?: string; body?: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, last_active_at")
    .eq("id", userId)
    .single();
  const tz = validTz(profile?.timezone as string | null);
  const local = localParts(now, tz);
  const slot: Slot | null = test ? (local.hour < 15 ? "am" : "pm") : slotFor(local.hour);
  if (!slot) return { outcome: "not_due" };

  const record = async (fields: Record<string, unknown>) => {
    if (test) return;
    await supabase
      .from("rundown_runs")
      .update(fields)
      .eq("user_id", userId)
      .eq("local_date", local.date)
      .eq("slot", slot);
  };

  if (!test) {
    const { error: claimErr } = await supabase
      .from("rundown_runs")
      .insert({ user_id: userId, local_date: local.date, slot });
    if (claimErr) {
      if (claimErr.code !== "23505") console.error("[send-rundown] claim failed", claimErr);
      return { outcome: "already_ran" };
    }
    // Only builds 53+ show the rundown, and only they record opens. Until a
    // person's app has reported in once, a rundown push would land them on
    // an inbox without one.
    if (!profile?.last_active_at) {
      await record({ outcome: "skipped_old_app" });
      return { outcome: "skipped_old_app" };
    }
    const lastActive = Date.parse(profile.last_active_at as string);
    if (now - lastActive < ACTIVE_SKIP_MS) {
      await record({ outcome: "skipped_active" });
      return { outcome: "skipped_active" };
    }
  }

  const lastActive = profile?.last_active_at ? Date.parse(profile.last_active_at as string) : 0;
  const input = await gather(userId, lastActive, slot, tz, now);
  const candidates = draftCandidates(input);
  if (!candidates.length) {
    await record({ outcome: "skipped_nothing", candidates: [] });
    return { outcome: "skipped_nothing" };
  }

  const { sent, opens } = await history(userId, now);
  const pick = pickCandidate(candidates, sent, opens, now)!;
  const result = await pushToUser(
    supabase as any,
    userId,
    { title: PUSH_TITLE, body: pick.candidate.body },
    "active",
    {
      kind: test ? "rundown_test" : "rundown",
      threadId: pick.candidate.threadId,
      variant: pick.candidate.variant,
      slot,
    },
  );
  const outcome: Outcome = result.sent > 0 ? "sent" : "failed";
  await record({
    outcome,
    variant: pick.candidate.variant,
    candidates: candidates.map((c) => c.variant),
  });
  return test
    ? { outcome, variant: pick.candidate.variant, body: pick.candidate.body }
    : { outcome, variant: pick.candidate.variant };
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const now = Date.now();

  // A signed-in user asking for their own test rundown.
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (jwt) {
    const { data } = await supabase.auth.getUser(jwt);
    if (data.user) return json(await runFor(data.user.id, now, true));
  }

  // Scheduled: everyone who can receive pushes.
  const { data: tokenRows } = await supabase
    .from("push_tokens")
    .select("user_id")
    .eq("platform", "ios");
  const userIds = [...new Set((tokenRows ?? []).map((r) => r.user_id as string))];
  const tally: Record<string, number> = {};
  for (const userId of userIds) {
    try {
      const { outcome } = await runFor(userId, now, false);
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    } catch (e) {
      console.error("[send-rundown] run failed", e);
      tally.error = (tally.error ?? 0) + 1;
    }
  }
  return json({ users: userIds.length, ...tally });
});
