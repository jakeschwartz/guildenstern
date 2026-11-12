// scan-calendar: twice a day, look at the next few days of a household's
// calendars and pull out what matters (see the calendar_notes migration):
//   - heads_up: things worth knowing → each person's rundown ("Coming up")
//   - prep:     to-dos an event needs first → rundown, one tap to the list
//   - question: household events nobody's clearly on, or clashes → Otis
//               asks in the shared thread
//
// Reads each partner's main Google calendar plus calendars shared with them
// (a family calendar), skipping holidays/birthdays and events they declined.
//
// Ways in:
//   Scheduled — pg_cron, no token, every 30 min. A partnership is scanned
//     when its local hour is 8 or 17 and it hasn't been scanned in 5 hours.
//     Body {"post_questions": true} lets Otis post; otherwise questions are
//     stored as pending and posted by a later run that allows it.
//   Signed-in user (Bearer JWT) — scans their partnership now. Body
//     {"dry_run": true} returns what the model found without writing.
//
// Privacy: a partner's own events only cross over when they affect the
// household, phrased without personal details (see the prompt).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { getValidGoogleAccessToken } from "../_shared/google_token.ts";
import {
  DEFAULT_TZ,
  describeNow,
  isValidTz,
  resolveDue,
  upcomingCalendar,
} from "../_shared/dates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const MODEL = "claude-opus-5-5";
const EFFORT = "medium";
const DAYS_AHEAD = 4;
const SCAN_HOURS = [8, 17];
const MIN_RESCAN_MS = 5 * 60 * 60 * 1000;
const QUIET_BEFORE = 8; // Otis doesn't post questions before 8am or after 9pm
const QUIET_AFTER = 21;
const MAX_CALENDARS = 8;
const MAX_EVENTS = 80;
const NOTES_CHARS = 300;

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

// ---------- people ----------

type Person = { id: string; first: string; tz: string; key: string };

const loadHousehold = async (partnershipId: string) => {
  const { data: members } = await supabase
    .from("partnership_members")
    .select("user_id, profiles(name, timezone)")
    .eq("partnership_id", partnershipId)
    .order("joined_at");
  const people: Person[] = (members ?? []).map((m: any, i: number) => ({
    id: m.user_id,
    first: (m.profiles?.name ?? `Person ${i + 1}`).split(" ")[0],
    tz: isValidTz(m.profiles?.timezone) ? m.profiles.timezone : DEFAULT_TZ,
    key: `p${i + 1}`,
  }));
  return people;
};

// The household's clock: the first member with a real timezone.
const householdTz = (people: Person[]) => people.find((p) => p.tz !== DEFAULT_TZ)?.tz ?? people[0]?.tz ?? DEFAULT_TZ;

const localHour = (now: Date, tz: string) =>
  Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now),
  );

// ---------- Google Calendar ----------

type Ev = {
  ref: string; // short id for the model
  key: string; // stable across both partners' copies
  whose: Set<string>; // person keys whose calendars show it
  calendars: Set<string>;
  shared: boolean; // on a calendar that isn't someone's own main one
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string | null;
  attendees: number;
  organizerIsSelf: boolean;
  notes: string;
};

const gcal = async (token: string, path: string, params: Record<string, string> = {}) => {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`google ${res.status} ${path}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
};

const SKIP_CAL = /#holiday@|#contacts@|addressbook#|#weeknum@|#weather@/;

const fetchPersonEvents = async (person: Person, now: Date, until: Date) => {
  const tok = await getValidGoogleAccessToken(supabase, person.id).catch(() => null);
  if (!tok || !tok.scope.includes("calendar")) return null;
  const list = await gcal(tok.access_token, "users/me/calendarList", { minAccessRole: "reader" });
  const cals = (list.items ?? [])
    .filter((c: any) => !c.hidden && c.selected !== false && !c.deleted && !SKIP_CAL.test(c.id))
    .sort((a: any, b: any) => Number(!!b.primary) - Number(!!a.primary))
    .slice(0, MAX_CALENDARS);
  const out: Array<{ cal: any; e: any }> = [];
  for (const cal of cals) {
    try {
      const data = await gcal(tok.access_token, `calendars/${encodeURIComponent(cal.id)}/events`, {
        timeMin: now.toISOString(),
        timeMax: until.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "100",
      });
      for (const e of data.items ?? []) out.push({ cal, e });
    } catch (err) {
      console.warn(`[scan-calendar] skip calendar for ${person.first}`, err);
    }
  }
  return out;
};

const toMs = (t: any) => (t?.dateTime ? Date.parse(t.dateTime) : t?.date ? Date.parse(`${t.date}T12:00:00Z`) : NaN);

const gatherEvents = async (people: Person[], now: Date, until: Date) => {
  const byKey = new Map<string, Ev>();
  const connected: Person[] = [];
  for (const person of people) {
    const raw = await fetchPersonEvents(person, now, until);
    if (!raw) continue;
    connected.push(person);
    for (const { cal, e } of raw) {
      if (e.status === "cancelled") continue;
      const me = (e.attendees ?? []).find((a: any) => a.self);
      if (me?.responseStatus === "declined") continue;
      if (e.eventType === "workingLocation" || e.eventType === "focusTime") continue;
      const start = toMs(e.start);
      if (Number.isNaN(start)) continue;
      const key = `${e.iCalUID ?? e.id}@${e.originalStartTime?.dateTime ?? e.originalStartTime?.date ?? e.start?.dateTime ?? e.start?.date}`;
      const existing = byKey.get(key);
      const calName = cal.primary ? `${person.first}'s calendar` : (cal.summaryOverride ?? cal.summary ?? "a shared calendar");
      if (existing) {
        existing.whose.add(person.key);
        existing.calendars.add(calName);
        existing.shared = existing.shared || !cal.primary;
        continue;
      }
      byKey.set(key, {
        ref: "",
        key,
        whose: new Set([person.key]),
        calendars: new Set([calName]),
        shared: !cal.primary,
        title: (e.summary ?? "(no title)").slice(0, 140),
        start,
        end: toMs(e.end),
        allDay: !e.start?.dateTime,
        location: e.location ? String(e.location).slice(0, 120) : null,
        attendees: (e.attendees ?? []).length,
        organizerIsSelf: !!e.organizer?.self,
        notes: String(e.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTES_CHARS),
      });
    }
  }
  const events = [...byKey.values()].sort((a, b) => a.start - b.start).slice(0, MAX_EVENTS);
  events.forEach((e, i) => (e.ref = `e${i + 1}`));
  return { events, connected };
};

// ---------- the model ----------

const SYSTEM_PROMPT = `You are the household assistant inside Guildenstern, an app two partners use to run their home together. You're looking at the next few days of their calendars to help them get ahead of things. Be selective: the value is in what you leave out. Most events need nothing from you.

Produce three kinds of output:

1. heads_up: things worth knowing about over the next few days that are OUT OF THE ORDINARY for this household: travel, a very early start or late night, guests staying, a school closure or half day, a kid's event or appointment, a big deadline, a day that's unusually packed, an event that needs someone home. Write each as one short line a busy parent would want ("Thursday's packed: dentist at 8, then the school play at 5"). Say who it's for: one person, or "both" when it affects the household. Never include routine work meetings, standups, recurring 1:1s, focus blocks, or anything they obviously already know. At most 4.

2. prep: concrete to-dos that an event needs BEFORE it happens: buy a birthday gift for a party, book a sitter for a night out, find forms or insurance cards for an appointment, RSVP, pack for a trip, confirm a reservation, get cash for a tip. Title it as a short imperative ("Buy a gift for Maya's party"). Give a due date (and time if it matters) before the event. Skip anything already on their open to-do list. Skip vague prep ("prepare for meeting"). Assign it to whoever owns the event; "both" if it's a shared household event. At most 4.

3. questions: coordination the two of them need to settle, which the assistant will ask in their shared chat. Use this for: a household or kid event on a shared calendar (or on both calendars) with no obvious owner ("who's taking Eli to the dentist Thursday at 4?"), or one person's plans that clash with a household need ("Jenny's out Thursday night and Jake has a dinner. Who's home with the kids?"). Ask plainly in one or two short sentences, warm, no preamble. Only when a real decision is needed; at most 2.

Privacy: each person's own calendar is theirs. Only bring up one partner's personal event to the other (in a heads_up for the other, or in a question) when it affects the household (they're away, out for the evening, unavailable for pickup), and then say only what's needed ("Jake's away Thursday night"), never the private details (no medical, therapy, work, or personal appointment titles of the other person).

Dates: use the calendar lookup to resolve days. Event ids (e1, e2, ...) must come from the list. Return empty lists when nothing qualifies; that is a good answer.`;

const schemaFor = (people: Person[]) => {
  const who = { type: "string", enum: [...people.map((p) => p.key), "both"] };
  const ids = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    properties: {
      heads_up: {
        type: "array",
        items: {
          type: "object",
          properties: { for: who, event_ids: ids, note: { type: "string" } },
          required: ["for", "event_ids", "note"],
          additionalProperties: false,
        },
      },
      prep: {
        type: "array",
        items: {
          type: "object",
          properties: {
            for: who,
            event_id: { type: "string" },
            title: { type: "string" },
            why: { type: "string" },
            due_date: { type: "string", description: "YYYY-MM-DD, or empty" },
            due_time: { type: "string", description: "HH:MM 24h, or empty" },
          },
          required: ["for", "event_id", "title", "why", "due_date", "due_time"],
          additionalProperties: false,
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: { event_ids: ids, question: { type: "string" } },
          required: ["event_ids", "question"],
          additionalProperties: false,
        },
      },
    },
    required: ["heads_up", "prep", "questions"],
    additionalProperties: false,
  };
};

type Found = {
  heads_up: Array<{ for: string; event_ids: string[]; note: string }>;
  prep: Array<{ for: string; event_id: string; title: string; why: string; due_date: string; due_time: string }>;
  questions: Array<{ event_ids: string[]; question: string }>;
};

const fmtWhen = (e: Ev, tz: string) => {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  if (e.allDay) {
    const lastDay = e.end - 24 * 3600e3;
    return lastDay > e.start ? `${day.format(e.start)} – ${day.format(lastDay)} (all day)` : `${day.format(e.start)} (all day)`;
  }
  return `${day.format(e.start)}, ${time.format(e.start)}–${time.format(e.end)}`;
};

const askModel = async (people: Person[], connected: Person[], events: Ev[], openTodos: string[], tz: string, now: Date) => {
  const names = people.map((p) => `${p.key} = ${p.first}${connected.includes(p) ? "" : " (calendar not connected)"}`).join("; ");
  const listing = events
    .map((e) => {
      const whose = [...e.whose].map((k) => people.find((p) => p.key === k)?.first).join(" and ");
      return [
        `<event id="${e.ref}">`,
        `When: ${fmtWhen(e, tz)}`,
        `Title: ${e.title}`,
        `On: ${[...e.calendars].join(", ")} (${whose}${e.whose.size > 1 ? ", on both their calendars" : ""}${e.shared ? ", shared calendar" : ""})`,
        e.location ? `Where: ${e.location}` : "",
        e.attendees ? `Invitees: ${e.attendees}${e.organizerIsSelf ? " (they organized it)" : ""}` : "",
        e.notes ? `Notes: ${e.notes}` : "",
        `</event>`,
      ].filter(Boolean).join("\n");
    })
    .join("\n");
  const content = [
    `People: ${names}.`,
    `Household local time: ${describeNow(now, tz)} (${tz}).`,
    upcomingCalendar(now, tz),
    `Already on their open to-do list:\n${openTodos.length ? openTodos.map((t) => `- ${t}`).join("\n") : "(nothing)"}`,
    `Calendar events, next ${DAYS_AHEAD} days:\n${listing || "(none)"}`,
  ].join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: schemaFor(people) } },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("claude refusal");
  if (data.stop_reason === "max_tokens") throw new Error("claude hit max_tokens");
  const text = data.content?.find((c: any) => c.type === "text")?.text ?? "";
  return JSON.parse(text) as Found;
};

// ---------- one household ----------

const defaultThread = async (partnershipId: string) => {
  const { data } = await supabase
    .from("threads")
    .select("id")
    .eq("partnership_id", partnershipId)
    .eq("kind", "partnership")
    .eq("is_default", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.id as string | undefined;
};

async function scanHousehold(
  partnershipId: string,
  opts: { force: boolean; dryRun: boolean; postQuestions: boolean },
) {
  const now = new Date();
  const people = await loadHousehold(partnershipId);
  if (!people.length) return { partnershipId, skipped: "no members" };
  const tz = householdTz(people);

  if (!opts.force) {
    if (!SCAN_HOURS.includes(localHour(now, tz))) return { partnershipId, skipped: "not scan hour" };
    const { data: state } = await supabase
      .from("calendar_scan_state")
      .select("last_scanned_at")
      .eq("partnership_id", partnershipId)
      .maybeSingle();
    if (state?.last_scanned_at && now.getTime() - Date.parse(state.last_scanned_at) < MIN_RESCAN_MS) {
      return { partnershipId, skipped: "scanned recently" };
    }
  }

  try {
    const until = new Date(now.getTime() + DAYS_AHEAD * 24 * 3600e3);
    const { events, connected } = await gatherEvents(people, now, until);
    if (!connected.length) {
      if (!opts.dryRun) {
        await supabase.from("calendar_scan_state").upsert({
          partnership_id: partnershipId,
          last_scanned_at: now.toISOString(),
          last_error: "no calendars connected",
        });
      }
      return { partnershipId, skipped: "no calendars connected" };
    }

    const thread = await defaultThread(partnershipId);
    const { data: threadRows } = await supabase.from("threads").select("id").eq("partnership_id", partnershipId);
    const { data: open } = await supabase
      .from("ops_cards")
      .select("title")
      .in("thread_id", (threadRows ?? []).map((t: any) => t.id))
      .in("status", ["pending", "accepted"])
      .limit(60);
    const found = events.length
      ? await askModel(people, connected, events, (open ?? []).map((c: any) => c.title), tz, now)
      : { heads_up: [], prep: [], questions: [] };

    const byRef = new Map(events.map((e) => [e.ref, e]));
    const forPeople = (who: string) => (who === "both" ? people : people.filter((p) => p.key === who));
    const firstEvent = (ids: string[]) => ids.map((r) => byRef.get(r)).find(Boolean);
    const rows: any[] = [];

    for (const h of found.heads_up ?? []) {
      const ev = firstEvent(h.event_ids);
      if (!ev || !h.note?.trim()) continue;
      for (const p of forPeople(h.for)) {
        rows.push({
          partnership_id: partnershipId,
          user_id: p.id,
          kind: "heads_up",
          dedupe_key: `${partnershipId}:heads_up:${p.id}:${ev.key}`,
          event_title: ev.title,
          event_start: new Date(ev.start).toISOString(),
          event_all_day: ev.allDay,
          _when: fmtWhen(ev, tz),
          note: h.note.trim(),
          status: "new",
        });
      }
    }
    for (const pr of found.prep ?? []) {
      const ev = byRef.get(pr.event_id);
      if (!ev || !pr.title?.trim()) continue;
      const due = resolveDue(pr.due_date, pr.due_time, tz);
      const slug = pr.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      for (const p of forPeople(pr.for)) {
        rows.push({
          partnership_id: partnershipId,
          user_id: p.id,
          kind: "prep",
          dedupe_key: `${partnershipId}:prep:${p.id}:${ev.key}:${slug}`,
          event_title: ev.title,
          event_start: new Date(ev.start).toISOString(),
          event_all_day: ev.allDay,
          _when: fmtWhen(ev, tz),
          note: (pr.why ?? "").trim() || pr.title.trim(),
          prep_title: pr.title.trim(),
          due_at: due?.due_at ?? null,
          due_has_time: due?.due_has_time ?? false,
          status: "new",
        });
      }
    }
    for (const q of found.questions ?? []) {
      const ev = firstEvent(q.event_ids);
      if (!ev || !q.question?.trim()) continue;
      rows.push({
        partnership_id: partnershipId,
        user_id: null,
        kind: "question",
        dedupe_key: `${partnershipId}:question:${ev.key}`,
        event_title: ev.title,
        event_start: new Date(ev.start).toISOString(),
        event_all_day: ev.allDay,
        _when: fmtWhen(ev, tz),
        note: q.question.trim(),
        status: "pending",
      });
    }

    if (opts.dryRun) {
      const label = (r: any) => people.find((p) => p.id === r.user_id)?.first ?? "shared";
      return {
        partnershipId,
        dryRun: true,
        calendarsFrom: connected.map((p) => p.first),
        eventsSeen: events.length,
        found: rows.map((r) => ({
          kind: r.kind,
          for: label(r),
          event: r.event_title,
          when: r._when,
          note: r.note,
          ...(r.prep_title ? { todo: r.prep_title } : {}),
          ...(r.due_at ? { due: r.due_at } : {}),
        })),
      };
    }

    if (rows.length) {
      const { error } = await supabase
        .from("calendar_notes")
        .upsert(rows.map(({ _when, ...r }) => r), { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (error) throw error;
    }

    // Retire questions whose event has passed; post pending ones if allowed
    // and it's a decent hour.
    await supabase
      .from("calendar_notes")
      .update({ status: "expired" })
      .eq("partnership_id", partnershipId)
      .eq("kind", "question")
      .eq("status", "pending")
      .lt("event_start", now.toISOString());
    let asked = 0;
    const hour = localHour(now, tz);
    if (opts.postQuestions && thread && hour >= QUIET_BEFORE && hour < QUIET_AFTER) {
      const { data: pending } = await supabase
        .from("calendar_notes")
        .select("id, note")
        .eq("partnership_id", partnershipId)
        .eq("kind", "question")
        .eq("status", "pending")
        .order("event_start")
        .limit(2);
      for (const q of pending ?? []) {
        const { data: msg, error } = await supabase
          .from("messages")
          .insert({ thread_id: thread, author_kind: "agent", author_user_id: null, body: q.note, context: "main" })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("calendar_notes").update({ status: "asked", message_id: msg.id }).eq("id", q.id);
        asked++;
      }
    }

    await supabase.from("calendar_scan_state").upsert({
      partnership_id: partnershipId,
      last_scanned_at: now.toISOString(),
      last_error: null,
    });
    return { partnershipId, eventsSeen: events.length, notes: rows.length, asked };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[scan-calendar]", partnershipId, message);
    if (!opts.dryRun) {
      await supabase.from("calendar_scan_state").upsert({
        partnership_id: partnershipId,
        last_scanned_at: now.toISOString(),
        last_error: message.slice(0, 500),
      });
    }
    return { partnershipId, error: message };
  }
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    // Operator dry run (service role key): see what a household would get.
    if (jwt === SERVICE_ROLE && body.dry_run === true && typeof body.partnership_id === "string") {
      return json(await scanHousehold(body.partnership_id, { force: true, dryRun: true, postQuestions: false }));
    }
    if (jwt && jwt !== SERVICE_ROLE) {
      const { data } = await supabase.auth.getUser(jwt);
      if (data.user) {
        const { data: m } = await supabase
          .from("partnership_members")
          .select("partnership_id")
          .eq("user_id", data.user.id)
          .limit(1)
          .maybeSingle();
        if (!m) return json({ skipped: "no partnership" });
        return json(
          await scanHousehold(m.partnership_id, {
            force: true,
            dryRun: body.dry_run === true,
            postQuestions: false,
          }),
        );
      }
    }

    const { data: partnerships } = await supabase.from("partnerships").select("id");
    const results = [];
    for (const p of partnerships ?? []) {
      results.push(
        await scanHousehold(p.id, {
          force: false,
          dryRun: false,
          postQuestions: body.post_questions === true,
        }),
      );
    }
    return json({ results });
  } catch (e) {
    console.error("[scan-calendar] uncaught", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
