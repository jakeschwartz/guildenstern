import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { BriefingCard } from "../components/BriefingCard";
import type { BriefingItem, Message, User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
  onReviewNew: () => void;
  onOpenThread: (threadId: string) => void;
};

type RenderItem =
  | { kind: "single"; message: Message }
  | {
      kind: "fold";
      groupId: string;
      summary: string;
      messages: Message[];
    };

const groupMessages = (messages: Message[]): RenderItem[] => {
  const items: RenderItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i]!;
    if (!m.foldGroupId) {
      items.push({ kind: "single", message: m });
      i++;
      continue;
    }
    // Collect consecutive messages sharing this foldGroupId.
    const groupId = m.foldGroupId;
    const group: Message[] = [];
    while (i < messages.length && messages[i]!.foldGroupId === groupId) {
      group.push(messages[i]!);
      i++;
    }
    const summary =
      group.find((g) => g.foldSummary)?.foldSummary ?? "Resolved";
    items.push({ kind: "fold", groupId, summary, messages: group });
  }
  return items;
};

export const PersonalThread = ({
  threadId,
  onBack,
  onReviewNew,
  onOpenThread,
}: Props) => {
  const thread = useStore((s) =>
    s.threads.find((t) => t.id === threadId && t.kind === "personal"),
  );
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = useMemo(
    () => new Map<string, User>(users.map((u) => [u.id, u])),
    [users],
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(),
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
  const items = groupMessages(thread.messages);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

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
        {items.map((item) => {
          if (item.kind === "fold") {
            const isExpanded = expandedGroups.has(item.groupId);
            return (
              <div key={item.groupId} className="flex flex-col gap-3">
                <button
                  onClick={() => toggleGroup(item.groupId)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-rule bg-card/40 hover:bg-card transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-agent text-[12px] shrink-0">✓</span>
                    <span className="text-[12.5px] text-muted truncate">
                      {item.summary}
                    </span>
                  </span>
                  <span className="text-muted text-[11px] shrink-0">
                    {isExpanded ? "Hide" : "Expand"}
                  </span>
                </button>
                {isExpanded && (
                  <div className="flex flex-col gap-4 pl-2 border-l-2 border-rule">
                    {item.messages.map((m) => {
                      const author =
                        m.author.kind === "human"
                          ? usersById.get(m.author.userId) ?? null
                          : null;
                      const isSelf =
                        m.author.kind === "human" &&
                        m.author.userId === currentUserId;
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
                )}
              </div>
            );
          }

          const m = item.message;
          const author =
            m.author.kind === "human"
              ? usersById.get(m.author.userId) ?? null
              : null;
          const isSelf =
            m.author.kind === "human" && m.author.userId === currentUserId;
          const handleItemTap = (briefingItem: BriefingItem) => {
            if (briefingItem.action === "review-new") {
              onReviewNew();
              return;
            }
            if (briefingItem.threadId) {
              onOpenThread(briefingItem.threadId);
            }
          };
          return (
            <div key={m.id} className="flex flex-col gap-3">
              {m.briefing && (
                <BriefingCard
                  title={m.briefing.title}
                  items={m.briefing.items}
                  onTapItem={handleItemTap}
                />
              )}
              {m.body && (
                <MessageBubble message={m} author={author} isSelf={isSelf} />
              )}
            </div>
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
