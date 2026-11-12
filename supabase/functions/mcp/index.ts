// mcp: Guildenstern as a connector for Claude and ChatGPT (Model Context
// Protocol, Streamable HTTP, stateless JSON responses).
//
// A person makes a private link in the app (create_mcp_token) and pastes it
// into Claude (Settings → Connectors → Add custom connector) or ChatGPT
// (developer-mode connector, no auth). The link is
//   https://<project>.supabase.co/functions/v1/mcp/<token>
// The token in the path (or a Bearer header) identifies the person; only its
// SHA-256 is stored server-side. Every read is scoped to that person's
// partnerships, and every write goes through the mcp_* SQL functions, which
// act as the person so pushes, acted_by and Otis behave as if they'd tapped
// in the app.
//
// verify_jwt = false in config.toml: the caller is an assistant, not a
// Supabase user, and the token here is the auth.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { DEFAULT_TZ, describeNow, isValidTz, resolveDue } from "../_shared/dates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "guildenstern", title: "Guildenstern", version: "1.0.0" };
const INSTRUCTIONS = `Guildenstern is a shared to-do list and chat between two partners (a couple running a household). You act as the signed-in person. Start with get_overview to see who they are, who their partner is, their threads and what's open. Items have an owner (one of the two partners) and an optional due date. Adding or finishing items is low-stakes. send_message delivers a real message to their partner and notifies them: always show the person the exact text and get their OK before calling it.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

class UserError extends Error {}

// ---------------------------------------------------------------- context

type Ctx = {
  userId: string;
  name: string;
  tz: string;
  partner: { id: string; name: string } | null;
  threads: { id: string; title: string; is_default: boolean; last_activity_at: string }[];
};

const loadCtx = async (userId: string): Promise<Ctx> => {
  const { data: me } = await db
    .from("profiles")
    .select("name, timezone")
    .eq("id", userId)
    .single();
  const { data: memberships } = await db
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", userId);
  const pids = (memberships ?? []).map((m: any) => m.partnership_id);
  let partner: Ctx["partner"] = null;
  let threads: Ctx["threads"] = [];
  if (pids.length) {
    const { data: others } = await db
      .from("partnership_members")
      .select("user_id, profiles(name)")
      .in("partnership_id", pids)
      .neq("user_id", userId)
      .limit(1);
    if (others?.[0]) {
      partner = { id: others[0].user_id, name: (others[0] as any).profiles?.name ?? "your partner" };
    }
    const { data: t } = await db
      .from("threads")
      .select("id, title, is_default, last_activity_at")
      .eq("kind", "partnership")
      .in("partnership_id", pids)
      .order("last_activity_at", { ascending: false });
    threads = t ?? [];
  }
  return {
    userId,
    name: me?.name ?? "you",
    tz: isValidTz(me?.timezone) ? me!.timezone : DEFAULT_TZ,
    partner,
    threads,
  };
};

const norm = (s: string) =>
  s.toLowerCase().replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Thread by id, exact title, or loose title match. Omitted → the main thread.
const pickThread = (ctx: Ctx, ref?: string) => {
  if (!ctx.threads.length) throw new UserError("You aren't in a shared space with a partner yet.");
  if (!ref || !ref.trim()) {
    return ctx.threads.find((t) => t.is_default) ?? ctx.threads[ctx.threads.length - 1];
  }
  const byId = ctx.threads.find((t) => t.id === ref.trim());
  if (byId) return byId;
  const q = norm(ref);
  if (q === "main" || q === "home" || q === "general") {
    return ctx.threads.find((t) => t.is_default) ?? ctx.threads[0];
  }
  const exact = ctx.threads.find((t) => norm(t.title) === q);
  if (exact) return exact;
  const loose = ctx.threads.filter((t) => norm(t.title).includes(q) || q.includes(norm(t.title)));
  if (loose.length === 1) return loose[0];
  const names = ctx.threads.map((t) => `"${t.title}"`).join(", ");
  throw new UserError(
    loose.length
      ? `"${ref}" matches more than one thread: ${loose.map((t) => `"${t.title}"`).join(", ")}.`
      : `No thread called "${ref}". Threads: ${names}.`,
  );
};

const resolvePerson = (ctx: Ctx, who: string | undefined, fallback: "me" | "partner") => {
  const w = norm(who ?? fallback);
  if (w === "me" || w === "self" || w === "i" || w === norm(ctx.name)) return ctx.userId;
  if (w === "partner" || (ctx.partner && w === norm(ctx.partner.name))) {
    if (!ctx.partner) throw new UserError("No partner has joined yet.");
    return ctx.partner.id;
  }
  throw new UserError(`Owner must be "me" or "partner"${ctx.partner ? ` (${ctx.partner.name})` : ""}.`);
};

const personName = (ctx: Ctx, id: string | null) =>
  id === ctx.userId ? `${ctx.name} (you)` : id === ctx.partner?.id ? ctx.partner.name : "someone";

// ---------------------------------------------------------------- formatting

const fmtLocal = (iso: string, tz: string, withTime: boolean) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(iso));

const itemOut = (ctx: Ctx, c: any) => ({
  id: c.id,
  title: c.title,
  ...(c.subtitle ? { details: c.subtitle } : {}),
  owner: personName(ctx, c.owner_id),
  status: c.status === "done" ? "done" : c.status === "accepted" ? "open (accepted)" : "open",
  due: c.due_at ? fmtLocal(c.due_at, ctx.tz, c.due_has_time) : c.when_label || null,
  ...(c.due_at && c.status !== "done" && new Date(c.due_at).getTime() < Date.now() - 12 * 3600e3
    ? { overdue: true }
    : {}),
  thread: ctx.threads.find((t) => t.id === c.thread_id)?.title ?? null,
  ...(c.done_at ? { done: fmtLocal(c.done_at, ctx.tz, false) } : {}),
});

const OPEN = ["pending", "accepted"];

const CARD_COLS =
  "id, thread_id, title, subtitle, owner_id, when_label, bucket, status, due_at, due_has_time, done_at, created_at";

const byDue = (a: any, b: any) => {
  const da = a.due_at ? Date.parse(a.due_at) : Infinity;
  const dbb = b.due_at ? Date.parse(b.due_at) : Infinity;
  return da - dbb || Date.parse(b.created_at) - Date.parse(a.created_at);
};

// ---------------------------------------------------------------- tools

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: any;
  annotations: Record<string, unknown>;
  run: (ctx: Ctx, args: any) => Promise<unknown>;
};

const threadArg = {
  type: "string",
  description: "Thread name (e.g. \"Kitchen reno\") or id. Omit for the main shared thread.",
};

const TOOLS: Tool[] = [
  {
    name: "get_overview",
    title: "Overview",
    description:
      "Who the person is, their partner, the current local date/time, their shared threads, and what's open: items on them, items on their partner, and what got done this week. Call this first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx) => {
      const ids = ctx.threads.map((t) => t.id);
      const { data: open } = ids.length
        ? await db.from("ops_cards").select(CARD_COLS).in("thread_id", ids).in("status", OPEN)
        : { data: [] as any[] };
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data: done } = ids.length
        ? await db
            .from("ops_cards")
            .select(CARD_COLS)
            .in("thread_id", ids)
            .eq("status", "done")
            .gte("done_at", weekAgo)
            .order("done_at", { ascending: false })
            .limit(15)
        : { data: [] as any[] };
      const rows = (open ?? []).sort(byDue);
      return {
        you: ctx.name,
        partner: ctx.partner?.name ?? null,
        now: describeNow(new Date(), ctx.tz),
        timezone: ctx.tz,
        threads: ctx.threads.map((t) => ({
          name: t.title,
          id: t.id,
          main: t.is_default,
          last_activity: fmtLocal(t.last_activity_at, ctx.tz, true),
        })),
        open_on_you: rows.filter((c) => c.owner_id === ctx.userId).map((c) => itemOut(ctx, c)),
        open_on_partner: rows.filter((c) => c.owner_id !== ctx.userId).map((c) => itemOut(ctx, c)),
        done_this_week: (done ?? []).map((c) => itemOut(ctx, c)),
      };
    },
  },
  {
    name: "list_items",
    title: "List items",
    description:
      "List to-do items, soonest due first. Filter by thread, owner and status.",
    inputSchema: {
      type: "object",
      properties: {
        thread: { ...threadArg, description: "Thread name or id. Omit for all threads." },
        owner: { type: "string", enum: ["me", "partner", "anyone"], default: "anyone" },
        status: { type: "string", enum: ["open", "done", "all"], default: "open" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const ids = a.thread ? [pickThread(ctx, a.thread).id] : ctx.threads.map((t) => t.id);
      if (!ids.length) return { items: [] };
      let q = db.from("ops_cards").select(CARD_COLS).in("thread_id", ids);
      if ((a.status ?? "open") === "open") q = q.in("status", OPEN);
      else if (a.status === "done") q = q.eq("status", "done");
      const owner = a.owner ?? "anyone";
      if (owner !== "anyone") q = q.eq("owner_id", resolvePerson(ctx, owner, "me"));
      const limit = Math.min(Math.max(Number(a.limit) || 50, 1), 100);
      const { data, error } = await q
        .order(a.status === "done" ? "done_at" : "created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = a.status === "done" ? data ?? [] : (data ?? []).sort(byDue);
      return { items: rows.map((c) => itemOut(ctx, c)) };
    },
  },
  {
    name: "add_item",
    title: "Add an item",
    description:
      "Add a to-do item to the shared list, owned by the person or their partner. It shows up in the app and on the owner's daily rundown. Resolve relative dates (\"tomorrow\", \"Thursday\") against the local date from get_overview and pass due_date as YYYY-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, imperative: \"Book the plumber\"." },
        details: { type: "string", description: "Optional one-line detail." },
        owner: { type: "string", enum: ["me", "partner"], default: "me" },
        due_date: { type: "string", description: "YYYY-MM-DD in the person's local time." },
        due_time: { type: "string", description: "HH:MM, 24-hour local time, if there's a specific time." },
        thread: threadArg,
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (ctx, a) => {
      const title = String(a.title ?? "").trim();
      if (!title) throw new UserError("title is required.");
      if (title.length > 200) throw new UserError("Keep the title under 200 characters.");
      const thread = pickThread(ctx, a.thread);
      const owner = resolvePerson(ctx, a.owner, "me");
      let due: ReturnType<typeof resolveDue> = null;
      if (a.due_date) {
        due = resolveDue(a.due_date, a.due_time, ctx.tz);
        if (!due) throw new UserError("due_date must be YYYY-MM-DD and due_time HH:MM.");
      }
      const dueMs = due ? Date.parse(due.due_at) : null;
      const bucket =
        dueMs === null ? "week"
        : dueMs < Date.now() + 2 * 864e5 ? "today"
        : dueMs < Date.now() + 7 * 864e5 ? "week"
        : "long";
      const { data: id, error } = await db.rpc("mcp_add_item", {
        p_user: ctx.userId,
        p_thread: thread.id,
        p_owner: owner,
        p_title: title,
        p_subtitle: a.details ?? null,
        p_when_label: due ? fmtLocal(due.due_at, ctx.tz, due.due_has_time) : "via assistant",
        p_bucket: bucket,
        p_due_at: due?.due_at ?? null,
        p_due_has_time: due?.due_has_time ?? false,
      });
      if (error) throw new UserError(error.message);
      const { data: card } = await db.from("ops_cards").select(CARD_COLS).eq("id", id).single();
      return { added: itemOut(ctx, card) };
    },
  },
  {
    name: "update_item",
    title: "Update an item",
    description:
      "Mark an item done (or reopen it), or hand it to the other person. Get item ids from get_overview or list_items.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        done: { type: "boolean", description: "true = mark done, false = reopen." },
        owner: { type: "string", enum: ["me", "partner"], description: "Reassign the item." },
      },
      required: ["item_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      if (a.done === undefined && a.owner === undefined) {
        throw new UserError("Pass done and/or owner.");
      }
      const { error } = await db.rpc("mcp_update_item", {
        p_user: ctx.userId,
        p_card: String(a.item_id ?? ""),
        p_status: a.done === undefined ? null : a.done ? "done" : "pending",
        p_owner: a.owner === undefined ? null : resolvePerson(ctx, a.owner, "me"),
      });
      if (error) throw new UserError(/uuid/i.test(error.message) ? "item not found" : error.message);
      const { data: card } = await db.from("ops_cards").select(CARD_COLS).eq("id", a.item_id).single();
      return { updated: itemOut(ctx, card) };
    },
  },
  {
    name: "read_messages",
    title: "Read messages",
    description:
      "Recent messages in a shared thread between the person and their partner (oldest first), including notes from Otis, the app's assistant.",
    inputSchema: {
      type: "object",
      properties: {
        thread: threadArg,
        limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const thread = pickThread(ctx, a.thread);
      const limit = Math.min(Math.max(Number(a.limit) || 30, 1), 100);
      const { data, error } = await db
        .from("messages")
        .select("author_kind, author_user_id, body, created_at")
        .eq("thread_id", thread.id)
        .eq("context", "main")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return {
        thread: thread.title,
        messages: (data ?? []).reverse().map((m: any) => ({
          from: m.author_kind === "agent" ? "Otis (assistant)" : personName(ctx, m.author_user_id),
          at: fmtLocal(m.created_at, ctx.tz, true),
          text: m.body,
        })),
      };
    },
  },
  {
    name: "get_thread_summary",
    title: "Thread summary",
    description:
      "Otis's \"where we are\" summary of a topic thread (a trip, a project): what's decided, open and next. Not available for the main thread.",
    inputSchema: {
      type: "object",
      properties: { thread: { ...threadArg, description: "Thread name or id." } },
      required: ["thread"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const thread = pickThread(ctx, a.thread);
      const { data } = await db
        .from("spoke_summaries")
        .select("summary, sections, updated_at")
        .eq("thread_id", thread.id)
        .maybeSingle();
      if (!data) {
        return {
          thread: thread.title,
          summary: null,
          note: "No summary yet. Use read_messages to read the thread directly.",
        };
      }
      return {
        thread: thread.title,
        summary: data.summary,
        sections: data.sections,
        updated: fmtLocal(data.updated_at, ctx.tz, true),
      };
    },
  },
  {
    name: "send_message",
    title: "Message partner",
    description:
      "Send a message from the person to their partner in a shared thread. It is delivered as if they typed it in the app and their partner gets a notification; Otis also files any to-dos in it. Before calling, show the person the exact text and get an explicit OK. Write it in their voice, short and casual.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The message, exactly as approved." },
        thread: threadArg,
      },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: async (ctx, a) => {
      const text = String(a.text ?? "").trim();
      if (!text) throw new UserError("text is required.");
      if (text.length > 4000) throw new UserError("Keep messages under 4000 characters.");
      const thread = pickThread(ctx, a.thread);
      const { error } = await db.rpc("mcp_send_message", {
        p_user: ctx.userId,
        p_thread: thread.id,
        p_body: text,
      });
      if (error) throw new UserError(error.message);
      return { sent: true, thread: thread.title, to: ctx.partner?.name ?? null };
    },
  },
];

const toolsList = TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
  name,
  title,
  description,
  inputSchema,
  annotations,
}));

// ---------------------------------------------------------------- JSON-RPC

const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

const handle = async (msg: any, userId: string): Promise<unknown | null> => {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg?.id, -32600, "Invalid request");
  }
  const isNotification = msg.id === undefined || msg.id === null;
  const { id, method, params } = msg;
  if (isNotification) return null;

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: toolsList } };
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const ctx = await loadCtx(userId);
        const out = await tool.run(ctx, params?.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
            structuredContent: out,
          },
        };
      } catch (e) {
        const known = e instanceof UserError;
        if (!known) console.error(`tool ${tool.name} failed`, e);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: known ? (e as Error).message : "Something went wrong on Guildenstern's side." }],
            isError: true,
          },
        };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
};

// ---------------------------------------------------------------- HTTP

const tokenFrom = (req: Request) => {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+([a-f0-9]{48})$/i.exec(auth.trim());
  if (bearer) return bearer[1].toLowerCase();
  const segs = new URL(req.url).pathname.split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "";
  return /^[a-f0-9]{48}$/i.test(last) ? last.toLowerCase() : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...CORS, Allow: "POST, OPTIONS" },
    });
  }

  const token = tokenFrom(req);
  const { data: userId } = token
    ? await db.rpc("mcp_resolve_token", { p_token: token })
    : { data: null };
  if (!userId) {
    return json(
      rpcError(null, -32001, "This Guildenstern link isn't valid anymore. Make a new one in the app: menu → Connect Claude or ChatGPT."),
      401,
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, userId)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handle(body, userId);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
});
