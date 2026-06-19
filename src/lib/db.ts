// Typed Supabase data-access helpers for v0 (partnership dogfood scope).
// Higher-level mutation orchestration lives in src/state/store.ts; this file
// is intentionally CRUD-only.
//
// RLS enforces the access rules on the server; these helpers don't re-check.

import { supabase } from "./supabase";
import type { Attachment, OpsBucket, OpsCardStatus } from "../types";

// ---------- profiles ----------

export type Profile = {
  id: string;
  name: string;
  initials: string;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,initials")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateOwnProfile(
  patch: Partial<Pick<Profile, "name" | "initials">>,
): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq(
    "id",
    (await supabase.auth.getUser()).data.user?.id ?? "",
  );
  if (error) throw error;
}

// ---------- partnerships ----------

export type Partnership = {
  id: string;
  created_at: string;
};

export async function getMyPartnerships(): Promise<Partnership[]> {
  const { data, error } = await supabase
    .from("partnerships")
    .select("id,created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createPartnership(): Promise<string> {
  // Single RPC so partnership row + self-membership happen atomically without
  // tripping the "must be a member to read" SELECT policy on partnerships.
  const { data, error } = await supabase.rpc("create_partnership_with_me");
  if (error) throw error;
  return data as string;
}

export async function getPartnershipMembers(
  partnershipId: string,
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("partnership_members")
    .select("user_id, profiles(id,name,initials)")
    .eq("partnership_id", partnershipId);
  if (error) throw error;
  return (data ?? [])
    .map((r) => r.profiles as unknown as Profile)
    .filter(Boolean);
}

// ---------- invites ----------

export type Invite = {
  code: string;
  partnership_id: string;
  invited_by: string;
  expires_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
};

const randomCode = (len = 8) =>
  Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31])
    .join("");

export async function createInvite(partnershipId: string): Promise<Invite> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");
  const code = randomCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("partnership_invites")
    .insert({
      code,
      partnership_id: partnershipId,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Invite;
}

// Find the freshest unredeemed invite for a partnership (so we can show it
// in the UI instead of always generating a new one).
export async function getOrCreateInvite(
  partnershipId: string,
): Promise<Invite> {
  const { data: existing, error: readErr } = await supabase
    .from("partnership_invites")
    .select("*")
    .eq("partnership_id", partnershipId)
    .is("redeemed_by", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) return existing as Invite;
  return createInvite(partnershipId);
}

// Redeem flow uses a security-definer RPC (added in a later migration) so that
// the redeemer can look up by code without having read access to all invites.
export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });
  if (error) throw error;
  return data as string; // returns partnership_id
}

// ---------- threads ----------

export type ThreadRow = {
  id: string;
  kind: "partnership" | "personal";
  partnership_id: string | null;
  owner_id: string | null;
  title: string;
  is_default: boolean;
  agent_active: boolean;
  created_at: string;
  last_activity_at: string;
};

export async function getThreadsForPartnership(
  partnershipId: string,
): Promise<ThreadRow[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("partnership_id", partnershipId)
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ThreadRow[];
}

export async function getOrCreatePersonalThread(): Promise<ThreadRow> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");
  // Read first. limit(1) defensively in case any legacy duplicates exist.
  const { data: rows, error: readErr } = await supabase
    .from("threads")
    .select("*")
    .eq("kind", "personal")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (readErr) throw readErr;
  if (rows && rows.length > 0) return rows[0] as ThreadRow;
  // Try to insert. If the partial unique index trips (race with another
  // concurrent hydrate), swallow the error and re-read.
  const { data: created, error: createErr } = await supabase
    .from("threads")
    .insert({
      kind: "personal",
      owner_id: user.id,
      title: "Home",
      is_default: true,
    })
    .select("*")
    .single();
  if (created) return created as ThreadRow;
  if (createErr && createErr.code === "23505") {
    // Unique-violation: someone else inserted between read and write. Re-read.
    const { data: again } = await supabase
      .from("threads")
      .select("*")
      .eq("kind", "personal")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    if (again) return again as ThreadRow;
  }
  throw createErr ?? new Error("Could not create personal thread");
}

export async function createPartnershipThread(
  partnershipId: string,
  title: string,
  isDefault = false,
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from("threads")
    .insert({
      kind: "partnership",
      partnership_id: partnershipId,
      title,
      is_default: isDefault,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ThreadRow;
}

// ---------- messages ----------

export type MessageRow = {
  id: string;
  thread_id: string;
  author_kind: "human" | "agent";
  author_user_id: string | null;
  body: string;
  briefing: unknown | null;
  thread_suggestion: unknown | null;
  fold_group_id: string | null;
  fold_summary: string | null;
  created_at: string;
  context: "main" | "otis_chat";
  attachments: Attachment[] | null;
  agent_processed_at: string | null;
  reply_to_message_id: string | null;
};

export async function getMessages(
  threadId: string,
  limit = 200,
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export async function sendMessage(
  threadId: string,
  body: string,
  context: "main" | "otis_chat" = "main",
  attachments: Attachment[] = [],
  replyToMessageId: string | null = null,
): Promise<MessageRow> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      author_kind: "human",
      author_user_id: user.id,
      body,
      context,
      attachments,
      reply_to_message_id: replyToMessageId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as MessageRow;
}

// Relocate a message into another thread. Used when a partner accepts Otis's
// "move this to its own thread" suggestion. RLS must permit the update (both
// threads belong to the same partnership the caller is a member of).
export async function updateMessageThread(
  messageId: string,
  threadId: string,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ thread_id: threadId })
    .eq("id", messageId);
  if (error) throw error;
}

// Persist the lifecycle of an Otis thread-suggestion (accepted/dismissed) onto
// the agent message that carried it, so the proposal doesn't re-offer after a
// rehydrate. Payload is the full client-shape ThreadSuggestion object.
export async function updateMessageThreadSuggestion(
  messageId: string,
  suggestion: unknown,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ thread_suggestion: suggestion })
    .eq("id", messageId);
  if (error) throw error;
}

export function subscribeToThreadMessages(
  threadId: string,
  onInsert: (row: MessageRow) => void,
  onUpdate?: (row: MessageRow) => void,
  onDelete?: (id: string) => void,
) {
  // UPDATE matters now: Otis running-summary messages get their body
  // edited in place as the actor does more things. DELETE matters because
  // an Accept summary that becomes empty (Jake passed everything back)
  // gets the message row deleted entirely.
  const channel = supabase
    .channel(`messages:${threadId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => onInsert(payload.new as MessageRow),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => onUpdate?.(payload.new as MessageRow),
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old.id) onDelete?.(old.id);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------- ops cards ----------

export type OpsCardRow = {
  id: string;
  thread_id: string;
  source_message_id: string | null;
  source_user_id: string | null;
  title: string;
  subtitle: string | null;
  owner_id: string;
  when_label: string;
  bucket: OpsBucket;
  status: OpsCardStatus;
  clarification: unknown | null;
  created_at: string;
};

export async function getOpsCards(threadId: string): Promise<OpsCardRow[]> {
  const { data, error } = await supabase
    .from("ops_cards")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OpsCardRow[];
}

export async function updateOpsCardStatus(
  cardId: string,
  status: OpsCardStatus,
): Promise<void> {
  const { error } = await supabase
    .from("ops_cards")
    .update({ status })
    .eq("id", cardId);
  if (error) throw error;
}

// Refile/Pass: hand the card to the other partner. Status resets to 'pending'
// because the new owner hasn't committed to it — they need to Accept fresh.
// Single UPDATE so the trigger fires once (the 'passed' announce).
export async function updateOpsCardOwner(
  cardId: string,
  ownerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("ops_cards")
    .update({ owner_id: ownerId, status: "pending" })
    .eq("id", cardId);
  if (error) throw error;
}

// Ask the partner to clarify a card. Goes through a security-definer RPC
// because the side effect is an *agent*-authored message in the thread, which
// clients aren't allowed to insert directly. The RPC also stamps the card's
// clarification jsonb; realtime reconciles both partners.
export async function clarifyOpsCard(
  cardId: string,
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("clarify_ops_card", {
    p_card_id: cardId,
    p_note: note,
  });
  if (error) throw error;
}

export function subscribeToThreadOpsCards(
  threadId: string,
  onInsert: (row: OpsCardRow) => void,
  onUpdate?: (row: OpsCardRow) => void,
) {
  const channel = supabase
    .channel(`ops_cards:${threadId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "ops_cards",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => onInsert(payload.new as OpsCardRow),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "ops_cards",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => onUpdate?.(payload.new as OpsCardRow),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------- reactions (tapbacks) ----------

export type ReactionRow = {
  id: string;
  message_id: string;
  thread_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export async function getReactions(threadId: string): Promise<ReactionRow[]> {
  const { data, error } = await supabase
    .from("message_reactions")
    .select("*")
    .eq("thread_id", threadId);
  if (error) throw error;
  return (data ?? []) as ReactionRow[];
}

// Set (insert or replace) the caller's reaction on a message. One reaction
// per user per message — the unique constraint + upsert give iMessage
// semantics where picking a different tapback swaps it.
export async function setReaction(
  messageId: string,
  threadId: string,
  emoji: string,
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("message_reactions")
    .upsert(
      {
        message_id: messageId,
        thread_id: threadId,
        user_id: user.id,
        emoji,
      },
      { onConflict: "message_id,user_id" },
    );
  if (error) throw error;
}

export async function removeReaction(messageId: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export function subscribeToThreadReactions(
  threadId: string,
  onChange: (
    event: "INSERT" | "UPDATE" | "DELETE",
    row: ReactionRow,
  ) => void,
) {
  const channel = supabase
    .channel(`message_reactions:${threadId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "message_reactions",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        const event = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        // DELETE carries the old row (replica identity full); others the new.
        const row = (event === "DELETE" ? payload.old : payload.new) as ReactionRow;
        onChange(event, row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
