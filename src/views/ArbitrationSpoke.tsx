import { useMemo } from "react";
import { useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import type { User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
};

export const ArbitrationSpoke = ({ threadId, onBack }: Props) => {
  const thread = useStore((s) =>
    s.threads.find((t) => t.id === threadId && t.kind === "arbitration"),
  );
  const partnerships = useStore((s) => s.partnerships);
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = useMemo(
    () => new Map<string, User>(users.map((u) => [u.id, u])),
    [users],
  );

  if (!thread || thread.kind !== "arbitration") {
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
  const partnerId = partnership
    ? partnership.participantIds[0] === currentUserId
      ? partnership.participantIds[1]
      : partnership.participantIds[0]
    : null;
  const partner = partnerId ? usersById.get(partnerId) : null;
  const me = usersById.get(currentUserId);
  const spoke = thread.ventSpokes[currentUserId];

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
          <div className="text-[12px] text-agent font-medium">Private vent</div>
          <h2 className="text-[20px] font-semibold leading-tight text-ink mt-0.5 truncate tracking-tight">
            Agent <span className="text-muted font-normal">·</span> {me?.name ?? "You"}
          </h2>
          <div className="text-[12px] text-muted mt-0.5 truncate">
            About: {thread.question}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 px-4 py-2 bg-agent-tint border-b border-rule">
        <span className="h-1.5 w-1.5 rounded-full bg-agent shrink-0" />
        <span className="text-[12px] text-agent font-medium">
          {partner
            ? `Only you and the agent — ${partner.name} doesn't see this`
            : "Only you and the agent see this"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {(spoke?.messages ?? []).length === 0 && (
          <div className="text-[12px] text-muted italic mt-6 text-center">
            Nothing here yet. Say what's coming up.
          </div>
        )}
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
        {spoke?.positionRatified && (
          <div className="mt-2 px-3 py-2 bg-agent-tint border border-agent/30 rounded-md">
            <div className="text-[12px] text-agent font-semibold">
              Position shared
            </div>
            <p className="text-[12.5px] text-ink mt-1 leading-snug">
              Your position is now visible in the shared view. You can revisit
              this conversation anytime; nothing here moves over without you
              saying so.
            </p>
          </div>
        )}
      </div>

      <Composer
        onSend={(body) => {
          console.log("vent msg", body);
        }}
        placeholder="Say what's coming up"
      />
    </div>
  );
};
