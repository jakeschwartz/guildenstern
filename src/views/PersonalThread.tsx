// Mira's pinned thread — your private 1:1 with the concierge. Spec §7 scene
// 02 + 07. Agent messages render as Voice (rule + coded header). Human
// messages render as regular bubbles. The first message in a thread that
// would have shown a "briefing card" now flattens into a Voice with a list
// of RoutedRow items underneath, in keeping with the "everything is in her
// voice" framing.

import { useMemo } from "react";
import { sendMessage, useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { Voice } from "../components/Voice";
import { RoutedRow } from "../components/RoutedRow";
import { formatClock } from "../lib/time";
import type { BriefingItem, Message, User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
  onOpenThread: (threadId: string) => void;
};

const briefingToRoutedRows = (
  items: BriefingItem[],
  onOpenThread: (id: string) => void,
) =>
  items.map((it, i) => (
    <RoutedRow
      key={i}
      label={it.label}
      detail={it.detail}
      status={it.status}
      onTap={it.threadId ? () => onOpenThread(it.threadId!) : undefined}
    />
  ));

export const PersonalThread = ({ threadId, onBack, onOpenThread }: Props) => {
  const thread = useStore((s) =>
    s.threads.find((t) => t.id === threadId && t.kind === "personal"),
  );
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = useMemo(
    () => new Map<string, User>(users.map((u) => [u.id, u])),
    [users],
  );

  if (!thread || thread.kind !== "personal") {
    return (
      <div className="p-6 text-muted">
        Thread not found.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 pt-2 pb-3 border-b border-rule flex items-center gap-3">
        <button
          onClick={onBack}
          className="h-9 w-9 flex items-center justify-center text-muted hover:text-ink shrink-0"
          aria-label="Back"
        >
          <span className="text-[18px] leading-none">←</span>
        </button>
        <div className="flex items-baseline gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-mira shrink-0" />
          <span className="smallcaps text-[12px] text-mira">Mira</span>
          <span className="smallcaps text-[12px] text-muted">· concierge</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5">
        {thread.messages.length === 0 && (
          <div className="text-center text-[12.5px] text-muted py-8">
            Tell Mira what's on your mind.
          </div>
        )}
        {thread.messages.map((m: Message) => {
          if (m.author.kind === "agent") {
            if (m.briefing) {
              return (
                <Voice
                  key={m.id}
                  voice="mira"
                  name="Mira"
                  role="concierge"
                  body={m.body || undefined}
                  timestamp={formatClock(m.createdAt)}
                >
                  <div className="mt-1">
                    {briefingToRoutedRows(m.briefing.items, onOpenThread)}
                  </div>
                </Voice>
              );
            }
            return (
              <Voice
                key={m.id}
                voice="mira"
                name="Mira"
                role="concierge"
                body={m.body}
                timestamp={formatClock(m.createdAt)}
              />
            );
          }
          const author = usersById.get(m.author.userId) ?? null;
          const isSelf = m.author.userId === currentUserId;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              author={author}
              isSelf={isSelf}
            />
          );
        })}
      </div>

      <Composer
        onSend={(body) => {
          if (body.trim()) sendMessage(thread.id, body);
        }}
        placeholder="Tell Mira"
      />
    </div>
  );
};
