import { useMemo } from "react";
import { useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import type { User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
};

export const PersonalThread = ({ threadId, onBack }: Props) => {
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

  if (thread.ownerId !== currentUserId) {
    const owner = usersById.get(thread.ownerId);
    return (
      <div className="flex flex-col h-full">
        <header className="px-4 pt-12 pb-3 border-b border-rule flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-[14px] text-muted hover:text-ink shrink-0"
          >
            ←
          </button>
          <span className="text-[13px] text-muted">
            This is {owner?.name ?? "—"}'s private channel with the agent.
          </span>
        </header>
        <div className="flex-1 flex items-center justify-center px-8 text-center text-[13px] text-muted">
          Switch to {owner?.name ?? "the owner"} in the corner to see it.
        </div>
      </div>
    );
  }

  const me = usersById.get(currentUserId);

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 pt-12 pb-3 border-b border-rule flex items-center gap-3">
        <button
          onClick={onBack}
          className="h-9 w-9 flex items-center justify-center text-muted hover:text-ink shrink-0"
          aria-label="Back"
        >
          <span className="text-[18px] leading-none">←</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-agent shrink-0" />
          <span className="text-[15px] font-semibold text-ink tracking-tight">
            Agent
          </span>
          <span className="text-[12px] text-muted">
            · {me?.name ?? "you"}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5">
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
          console.log("personal msg", body);
        }}
        placeholder="What's on your mind?"
      />
    </div>
  );
};
