import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { AgentIndicator } from "../components/AgentIndicator";
import { Composer } from "../components/Composer";
import { ThreadAnchor } from "../components/ThreadAnchor";
import { Sheet } from "../components/Sheet";
import { Avatar } from "../components/Avatar";
import type { User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
  onOpenSpoke: () => void;
};

export const GroupThread = ({ threadId, onBack, onOpenSpoke }: Props) => {
  const thread = useStore((s) =>
    s.threads.find((t) => t.id === threadId && t.kind === "group"),
  );
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = useMemo(
    () => new Map<string, User>(users.map((u) => [u.id, u])),
    [users],
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!thread || thread.kind !== "group") {
    return (
      <div className="p-6 text-muted">
        Thread not found.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }

  const awaiting = Boolean(thread.spokes[currentUserId]?.awaitingMember);
  const members = thread.memberIds
    .map((id) => usersById.get(id))
    .filter((u): u is User => Boolean(u));

  return (
    <div className="flex flex-col h-full">
      <ThreadAnchor onBack={onBack} onExpand={() => setSheetOpen(true)}>
        <span className="text-[17px] font-semibold text-ink truncate tracking-tight">
          {thread.title}
        </span>
        <span className="text-[12px] text-muted shrink-0">
          · {thread.memberIds.length}
        </span>
      </ThreadAnchor>

      {thread.agentActive && (
        <AgentIndicator awaiting={awaiting} onOpenSpoke={onOpenSpoke} />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {thread.messages.map((m) => {
          const author =
            m.author.kind === "human"
              ? usersById.get(m.author.userId) ?? null
              : null;
          const isSelf =
            m.author.kind === "human" && m.author.userId === currentUserId;
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
          console.log("send to group", body);
        }}
        placeholder={`Message ${thread.title}`}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Thread"
      >
        <h3 className="text-[24px] font-semibold leading-tight text-ink tracking-tight">
          {thread.title}
        </h3>
        <div className="text-[12.5px] text-muted mt-1">
          {members.length} members · agent active
        </div>
        <ul className="mt-5 divide-y divide-rule border-y border-rule">
          {members.map((u) => {
            const isMe = u.id === currentUserId;
            const isHost = u.id === thread.hostId;
            return (
              <li key={u.id} className="py-3 flex items-center gap-3">
                <Avatar initials={u.initials} size="sm" />
                <span className="text-[14px] text-ink">{u.name}</span>
                {isMe && (
                  <span className="text-[12px] text-muted">You</span>
                )}
                {isHost && (
                  <span className="text-[12px] text-agent ml-auto">Host</span>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
};
