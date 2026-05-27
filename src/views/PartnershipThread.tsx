import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { ThreadAnchor } from "../components/ThreadAnchor";
import { Sheet } from "../components/Sheet";
import { Avatar } from "../components/Avatar";
import type { OpsCard, User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
};

const summarize = (
  cards: OpsCard[],
  currentUserId: string,
  partnerName: string,
): { tone: string; dot: string; label: string } => {
  const yoursPending = cards.filter(
    (c) => c.status === "pending" && c.owner === currentUserId,
  );
  const theirsPending = cards.filter(
    (c) => c.status === "pending" && c.owner !== currentUserId,
  );
  if (yoursPending.length > 0) {
    return {
      tone: "text-attention",
      dot: "bg-attention",
      label:
        yoursPending.length === 1
          ? `Waiting on you · ${yoursPending[0]!.title}`
          : `${yoursPending.length} waiting on you`,
    };
  }
  if (theirsPending.length > 0) {
    return {
      tone: "text-muted",
      dot: "bg-muted",
      label: `${theirsPending.length} with ${partnerName}`,
    };
  }
  if (cards.length > 0) {
    return {
      tone: "text-agent",
      dot: "bg-agent",
      label: "All caught up",
    };
  }
  return {
    tone: "text-agent",
    dot: "bg-agent",
    label: "Agent listening",
  };
};

export const PartnershipThread = ({ threadId, onBack }: Props) => {
  const thread = useStore((s) =>
    s.threads.find((t) => t.id === threadId && t.kind === "partnership"),
  );
  const partnerships = useStore((s) => s.partnerships);
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = useMemo(
    () => new Map<string, User>(users.map((u) => [u.id, u])),
    [users],
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!thread || thread.kind !== "partnership") {
    return (
      <div className="p-6 text-muted">
        Thread not found.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }

  const partnership = partnerships.find((p) => p.id === thread.partnershipId);
  if (!partnership) {
    return (
      <div className="p-6 text-muted">
        Partnership not found.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }

  const partnerId =
    partnership.participantIds[0] === currentUserId
      ? partnership.participantIds[1]
      : partnership.participantIds[0];
  const partner = usersById.get(partnerId);
  const me = usersById.get(currentUserId);

  if (!partner || !me) {
    return (
      <div className="p-6 text-muted">
        Not a participant in this thread.{" "}
        <button onClick={onBack} className="underline">
          Back
        </button>
      </div>
    );
  }

  // Jake's view is intentionally stubbed for this phase.
  if (currentUserId === "jake") {
    return (
      <div className="flex flex-col h-full">
        <ThreadAnchor onBack={onBack} onExpand={() => setSheetOpen(true)}>
          <Avatar initials={partner.initials} size="sm" />
          <span className="text-[17px] font-semibold text-ink truncate tracking-tight">
            {partner.name}
          </span>
          <span className="text-[12px] text-muted shrink-0">
            · {thread.title}
          </span>
        </ThreadAnchor>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="text-[12px] text-muted">Phase 2</div>
          <div className="text-[20px] font-semibold leading-tight text-ink mt-2 tracking-tight">
            Your {thread.title} view is being built.
          </div>
          <p className="text-[13px] text-muted leading-relaxed mt-3 max-w-[260px]">
            This is where the structured cards from {partner.name}'s messages
            will land — filtered to {thread.title}. For now switch to{" "}
            <span className="text-ink">{partner.name}</span> in the corner to see
            her side of the buffer.
          </p>
          {thread.opsCards.length > 0 && (
            <div className="mt-6 border-t border-rule pt-4 w-full text-left">
              <div className="text-[12px] text-muted mb-2">
                Seeded cards in {thread.title}
              </div>
              <ul className="divide-y divide-rule">
                {thread.opsCards.map((c) => (
                  <li key={c.id} className="py-2 flex items-baseline gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        c.status === "done"
                          ? "bg-agent"
                          : c.owner === "jake"
                            ? "bg-attention"
                            : "bg-muted"
                      }`}
                    />
                    <span className="text-[13px] text-ink">{c.title}</span>
                    <span className="text-[11px] text-muted ml-auto">
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Partnership"
        >
          <h3 className="text-[24px] font-semibold leading-tight text-ink tracking-tight">
            {me.name} &amp; {partner.name}
          </h3>
          <div className="text-[12.5px] text-muted mt-1">
            {thread.title} thread · agent active
          </div>
        </Sheet>
      </div>
    );
  }

  // Jenny's view: conversational surface with agent acks.
  const summary = summarize(thread.opsCards, currentUserId, partner.name);

  return (
    <div className="flex flex-col h-full">
      <ThreadAnchor onBack={onBack} onExpand={() => setSheetOpen(true)}>
        <Avatar initials={partner.initials} size="sm" />
        <span className="text-[17px] font-semibold text-ink truncate tracking-tight">
          {partner.name}
        </span>
        <span className="text-[12px] text-muted shrink-0">
          · {thread.title}
        </span>
      </ThreadAnchor>

      <div className="w-full h-11 px-4 flex items-center gap-2.5 border-b border-rule">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${summary.dot}`} />
        <span className={`text-[13px] font-semibold ${summary.tone} truncate`}>
          {summary.label}
        </span>
      </div>

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
          console.log("partnership msg", body);
        }}
        placeholder={`Message ${partner.name}`}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Partnership"
      >
        <h3 className="text-[24px] font-semibold leading-tight text-ink tracking-tight">
          {me.name} &amp; {partner.name}
        </h3>
        <div className="text-[12.5px] text-muted mt-1">
          {thread.title} thread · agent active
        </div>
        <div className="mt-5 border-t border-rule pt-4">
          <div className="text-[12px] text-muted mb-2">
            What the agent is tracking in {thread.title}
          </div>
          {thread.opsCards.length === 0 ? (
            <div className="text-[12px] text-muted italic">
              Nothing here yet.
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {thread.opsCards.map((card) => {
                const ownerName = usersById.get(card.owner)?.name ?? "—";
                return (
                  <li key={card.id} className="py-3 flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                        card.status === "done"
                          ? "bg-agent"
                          : card.status === "pending"
                            ? "bg-muted"
                            : "bg-rule"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] text-ink">
                        {card.title}
                      </div>
                      {card.subtitle && (
                        <div className="text-[12px] text-muted mt-0.5">
                          {card.subtitle}
                        </div>
                      )}
                      <div className="text-[11.5px] mt-1 text-muted">
                        {ownerName} · {card.when}
                        <span className="mx-1.5 text-rule">·</span>
                        <span
                          className={
                            card.status === "done"
                              ? "text-agent"
                              : "text-muted"
                          }
                        >
                          {card.status}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Sheet>
    </div>
  );
};
