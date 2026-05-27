import { useMemo } from "react";
import { useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import type { User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
};

export const Spoke = ({ threadId, onBack }: Props) => {
  const thread = useStore((s) =>
    s.threads.find((t) => t.id === threadId && t.kind === "group"),
  );
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = useMemo(
    () => new Map<string, User>(users.map((u) => [u.id, u])),
    [users],
  );

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

  const spoke = thread.spokes[currentUserId];
  const me = usersById.get(currentUserId);
  const isHost = thread.hostId === currentUserId;

  return (
    <div className="flex flex-col h-full bg-agent-tint/30">
      <header className="px-4 pt-12 pb-3 border-b border-rule flex items-start gap-3 bg-paper">
        <button
          onClick={onBack}
          className="text-[12px] text-muted hover:text-ink shrink-0 mt-1"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-agent font-medium">Private spoke</div>
          <h2 className="text-[20px] font-semibold leading-tight text-ink mt-0.5 truncate tracking-tight">
            Agent <span className="text-muted font-normal">·</span> {me?.name ?? "You"}
          </h2>
          <div className="text-[12px] text-muted mt-0.5 truncate">
            About: {thread.title}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 px-4 py-2 bg-agent-tint border-b border-rule">
        <span className="h-1.5 w-1.5 rounded-full bg-agent shrink-0" />
        <span className="text-[12px] text-agent font-medium">
          Only you and the agent see this
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {(spoke?.messages ?? []).map((m) => {
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
          console.log("send to spoke", body);
        }}
        placeholder={isHost ? "Message Agent" : "Reply to Agent"}
      />
    </div>
  );
};
