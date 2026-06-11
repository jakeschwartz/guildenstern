// Ephemeral typing indicators over Supabase Realtime broadcast. Nothing is
// persisted — "Jenny is typing…" is pure presence signal, gone the moment
// she stops or sends. One broadcast channel per thread.
//
// Send side: the composer calls sendTyping(threadId, true) on keystroke
// (the caller debounces); we auto-expire stale "typing" on the receiver so
// a dropped "stopped" event doesn't leave the indicator stuck.

import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type TypingPayload = { userId: string; typing: boolean };

// One channel per thread, lazily created, shared by send + subscribe.
const channels = new Map<string, RealtimeChannel>();

function getChannel(threadId: string): RealtimeChannel {
  let ch = channels.get(threadId);
  if (!ch) {
    ch = supabase.channel(`typing:${threadId}`, {
      config: { broadcast: { self: false } },
    });
    ch.subscribe();
    channels.set(threadId, ch);
  }
  return ch;
}

export function sendTyping(
  threadId: string,
  userId: string,
  typing: boolean,
): void {
  const ch = getChannel(threadId);
  void ch.send({
    type: "broadcast",
    event: "typing",
    payload: { userId, typing } satisfies TypingPayload,
  });
}

// Subscribe to typing events for a thread. Calls onChange with the set of
// user ids currently typing. Auto-expires each typer after 4s in case a
// "stopped" event is dropped.
export function subscribeTyping(
  threadId: string,
  onChange: (typingUserIds: string[]) => void,
): () => void {
  const ch = getChannel(threadId);
  const expirers = new Map<string, ReturnType<typeof setTimeout>>();
  const active = new Set<string>();

  const emit = () => onChange([...active]);

  const handler = (payload: { payload: TypingPayload }) => {
    const { userId, typing } = payload.payload;
    const existing = expirers.get(userId);
    if (existing) clearTimeout(existing);
    if (typing) {
      active.add(userId);
      expirers.set(
        userId,
        setTimeout(() => {
          active.delete(userId);
          expirers.delete(userId);
          emit();
        }, 4000),
      );
    } else {
      active.delete(userId);
      expirers.delete(userId);
    }
    emit();
  };

  ch.on("broadcast", { event: "typing" }, handler);

  return () => {
    expirers.forEach((t) => clearTimeout(t));
    expirers.clear();
    active.clear();
    // Leave the channel up (shared with sendTyping); just stop reacting.
    // Removing the listener isn't exposed cleanly, so we no-op the handler
    // by unsubscribing the channel only if nothing else needs it. Simplest:
    // remove + recreate on next use.
    const c = channels.get(threadId);
    if (c) {
      void supabase.removeChannel(c);
      channels.delete(threadId);
    }
  };
}
