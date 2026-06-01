// Supabase-backed reactive store. Mirrors the shape the prototype components
// expect (users, partnerships, threads, currentUserId) but the source of truth
// is the Supabase database, not localStorage.
//
// Initial load fans out:
//   - profile (me)
//   - partnerships (mine)
//   - profiles of partners
//   - personal thread (auto-create if missing)
//   - partnership threads
//   - messages + ops cards for each thread
//
// Realtime subscriptions for messages and ops cards keep the cache fresh.

import { useEffect, useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import * as db from "../lib/db";
import type {
  Message,
  MessageAuthor,
  OpsCard,
  Partnership,
  PartnershipThread,
  PersonalThread,
  Thread,
  User,
} from "../types";

type Status = "idle" | "loading" | "ready" | "no_partnership" | "error";

type State = {
  status: Status;
  error: string | null;
  currentUserId: string;
  users: User[];
  partnerships: Partnership[];
  threads: Thread[];
};

const initial: State = {
  status: "idle",
  error: null,
  currentUserId: "",
  users: [],
  partnerships: [],
  threads: [],
};

let state: State = initial;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((l) => l());
};

const setState = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};

export const getState = () => state;
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ---------- mapping helpers ----------

const profileToUser = (p: db.Profile): User => ({
  id: p.id,
  name: p.name,
  initials: p.initials,
});

const messageRowToMessage = (row: db.MessageRow): Message => {
  const author: MessageAuthor =
    row.author_kind === "human"
      ? { kind: "human", userId: row.author_user_id! }
      : { kind: "agent" };
  const briefing =
    row.briefing && typeof row.briefing === "object"
      ? (row.briefing as Message["briefing"])
      : undefined;
  return {
    id: row.id,
    author,
    body: row.body,
    createdAt: new Date(row.created_at).getTime(),
    briefing,
    foldGroupId: row.fold_group_id ?? undefined,
    foldSummary: row.fold_summary ?? undefined,
  };
};

const opsCardRowToOpsCard = (row: db.OpsCardRow): OpsCard => ({
  id: row.id,
  title: row.title,
  subtitle: row.subtitle ?? undefined,
  owner: row.owner_id,
  when: row.when_label,
  bucket: row.bucket,
  status: row.status,
  sourceMessageId: row.source_message_id ?? "",
  sourceUserId: row.source_user_id ?? "",
  createdAt: new Date(row.created_at).getTime(),
});

// ---------- hydration ----------

const realtimeUnsubs: Array<() => void> = [];
const subscribedThreadIds = new Set<string>();

const teardownRealtime = () => {
  while (realtimeUnsubs.length) {
    realtimeUnsubs.pop()?.();
  }
  subscribedThreadIds.clear();
};

const subscribeThread = (threadId: string) => {
  // Idempotent: re-running hydrate() shouldn't try to subscribe twice. Supabase
  // doesn't allow .on(postgres_changes) on an already-subscribed channel.
  if (subscribedThreadIds.has(threadId)) return;
  subscribedThreadIds.add(threadId);
  realtimeUnsubs.push(
    db.subscribeToThreadMessages(threadId, (row) => {
      const msg = messageRowToMessage(row);
      const threads = state.threads.map((t) => {
        if (t.id !== threadId) return t;
        // Already have the canonical row? Skip.
        if (t.messages.some((m) => m.id === msg.id)) return t;
        // If there's a matching optimistic row (same author + body), replace
        // it with the canonical. Otherwise the user sees their own message twice.
        const optimisticIdx = t.messages.findIndex(
          (m) =>
            m.id.startsWith("optimistic-") &&
            m.body === msg.body &&
            m.author.kind === msg.author.kind &&
            (msg.author.kind === "human" && m.author.kind === "human"
              ? m.author.userId === msg.author.userId
              : true),
        );
        if (optimisticIdx >= 0) {
          const replaced = [...t.messages];
          replaced[optimisticIdx] = msg;
          return { ...t, messages: replaced };
        }
        return { ...t, messages: [...t.messages, msg] };
      });
      setState({ threads });
    }),
  );
  // Partnership-thread ops_cards land here in realtime too — the agent-respond
  // edge function inserts them ahead of the "Got it — …" echo, so by the time
  // the recipient reacts to the push, their queue is already populated.
  realtimeUnsubs.push(
    db.subscribeToThreadOpsCards(threadId, (row) => {
      const card = opsCardRowToOpsCard(row);
      const threads = state.threads.map((t) => {
        if (t.id !== threadId || t.kind !== "partnership") return t;
        if (t.opsCards.some((c) => c.id === card.id)) return t;
        return { ...t, opsCards: [...t.opsCards, card] };
      });
      setState({ threads });
    }),
  );
};

export const hydrate = async (session: Session) => {
  setState({
    status: "loading",
    error: null,
    currentUserId: session.user.id,
    users: [],
    partnerships: [],
    threads: [],
  });
  teardownRealtime();

  try {
    const me = await db.getProfile(session.user.id);
    if (!me) throw new Error("Profile not found");

    const partnerships = await db.getMyPartnerships();
    const personal = await db.getOrCreatePersonalThread();

    // Map db's Partnership rows to our shape (participantIds tuple).
    const partnershipShapes: Partnership[] = [];
    const partnerProfiles: User[] = [];
    for (const p of partnerships) {
      const members = await db.getPartnershipMembers(p.id);
      const partner = members.find((m) => m.id !== session.user.id);
      // It's possible the partnership only has me (invited but not redeemed).
      partnershipShapes.push({
        id: p.id,
        participantIds: [session.user.id, partner?.id ?? session.user.id],
      });
      if (partner) partnerProfiles.push(profileToUser(partner));
    }

    // Load personal thread messages.
    const personalMsgs = await db.getMessages(personal.id);
    const personalThread: PersonalThread = {
      kind: "personal",
      id: personal.id,
      ownerId: session.user.id,
      messages: personalMsgs.map(messageRowToMessage),
      agentActive: personal.agent_active,
      createdAt: new Date(personal.created_at).getTime(),
    };
    subscribeThread(personal.id);

    // Load partnership threads (and create a default one if missing).
    const partnershipThreads: PartnershipThread[] = [];
    for (const p of partnerships) {
      let rows = await db.getThreadsForPartnership(p.id);
      if (rows.length === 0) {
        // Title is hidden in UI when is_default=true, but the DB row reads
        // cleaner as "Shared" than "Default" — and if the partner hasn't
        // joined yet, the inbox falls back to t.title.
        const created = await db.createPartnershipThread(p.id, "Shared", true);
        rows = [created];
      }
      for (const r of rows) {
        const [msgs, cards] = await Promise.all([
          db.getMessages(r.id),
          db.getOpsCards(r.id),
        ]);
        partnershipThreads.push({
          kind: "partnership",
          id: r.id,
          partnershipId: r.partnership_id!,
          title: r.title,
          isDefault: r.is_default,
          messages: msgs.map(messageRowToMessage),
          opsCards: cards.map(opsCardRowToOpsCard),
          agentActive: r.agent_active,
          createdAt: new Date(r.created_at).getTime(),
        });
        subscribeThread(r.id);
      }
    }

    setState({
      status: partnerships.length === 0 ? "no_partnership" : "ready",
      currentUserId: session.user.id,
      users: [profileToUser(me), ...partnerProfiles],
      partnerships: partnershipShapes,
      threads: [personalThread, ...partnershipThreads],
    });
  } catch (e) {
    console.error("[guildenstern] hydrate failed", e);
    setState({
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

export const reset = () => {
  teardownRealtime();
  state = initial;
  emit();
};

// ---------- mutations ----------

export const sendMessage = async (threadId: string, body: string) => {
  // Optimistic: append locally; realtime will reconcile the canonical row.
  const optimistic: Message = {
    id: `optimistic-${Date.now()}`,
    author: { kind: "human", userId: state.currentUserId },
    body,
    createdAt: Date.now(),
  };
  const threads = state.threads.map((t) =>
    t.id === threadId ? { ...t, messages: [...t.messages, optimistic] } : t,
  );
  setState({ threads });
  try {
    await db.sendMessage(threadId, body);
  } catch (e) {
    // Loud failure: log the raw error AND alert so dev iteration without
    // Safari Web Inspector still surfaces the problem. The optimistic message
    // gets rolled back so the input is ready for the user to try again.
    console.error("[guildenstern] sendMessage failed", { threadId, body, error: e });
    const errMsg = e instanceof Error ? e.message : JSON.stringify(e);
    if (typeof window !== "undefined" && "alert" in window) {
      window.alert(`Couldn't send: ${errMsg}`);
    }
    const rolled = state.threads.map((t) =>
      t.id === threadId
        ? { ...t, messages: t.messages.filter((m) => m.id !== optimistic.id) }
        : t,
    );
    setState({ threads: rolled, error: errMsg });
  }
};

export const createMyPartnership = async (): Promise<string> => {
  const partnershipId = await db.createPartnership();
  // Caller is responsible for triggering a rehydrate or follow-up; for our
  // onboarding flow we'll createInvite right after.
  return partnershipId;
};

export const createInviteForPartnership = async (
  partnershipId: string,
): Promise<string> => {
  const invite = await db.createInvite(partnershipId);
  return invite.code;
};

export const redeemInviteCode = async (code: string): Promise<string> => {
  const partnershipId = await db.redeemInvite(code);
  return partnershipId;
};

// ---------- React glue ----------

export const useStore = <T,>(selector: (s: State) => T): T =>
  useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );

// Listens to auth state changes and triggers hydration / reset.
export const useHydrateFromSession = (session: Session | null | "loading") => {
  useEffect(() => {
    if (session === "loading") return;
    if (session === null) {
      reset();
      return;
    }
    hydrate(session);
    return () => {
      // Don't reset on unmount — the session is still valid; just unsub realtime
      // on the next hydrate or signout.
    };
  }, [session]);
};
