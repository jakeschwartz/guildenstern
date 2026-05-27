import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { ThreadAnchor } from "../components/ThreadAnchor";
import { Sheet } from "../components/Sheet";
import { ReactionStrip } from "../components/ReactionStrip";
import type { ArbitrationOption, User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
  onOpenSpoke: () => void;
};

export const ArbitrationThread = ({ threadId, onBack, onOpenSpoke }: Props) => {
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
  const [sheetOpen, setSheetOpen] = useState(false);

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
  if (!partnership) {
    return (
      <div className="p-6 text-muted">
        Partnership missing.{" "}
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
  const yourSpoke = thread.ventSpokes[currentUserId];
  const yourRatified = Boolean(yourSpoke?.positionRatified);
  const isDecided = thread.decision !== null;

  const pillTone = isDecided ? "text-agent" : "text-deliberation";
  const pillDot = isDecided ? "bg-agent" : "bg-deliberation";
  const pillLabel = isDecided
    ? `Decided · ${thread.options.find((o) => o.id === thread.decision?.optionId)?.label ?? "—"}`
    : yourRatified
      ? `Deciding · your position is shared`
      : `Deciding · your position not yet shared`;

  return (
    <div className="flex flex-col h-full">
      <ThreadAnchor onBack={onBack} onExpand={() => setSheetOpen(true)}>
        <span className="text-[17px] font-semibold text-ink truncate tracking-tight">
          {partner ? `Decision with ${partner.name}` : "Decision"}
        </span>
      </ThreadAnchor>

      <div className="w-full h-11 px-4 flex items-center gap-2.5 border-b border-rule">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${pillDot}`} />
        <span className={`text-[13px] font-semibold ${pillTone} truncate`}>
          {pillLabel}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-5 pb-3 border-b border-rule">
          <div className="text-[12px] text-muted">The question</div>
          <h2 className="text-[22px] font-semibold leading-tight text-ink mt-1 tracking-tight">
            {thread.question}
          </h2>
        </div>

        <div className="border-b border-rule">
          <div className="px-4 pt-3 pb-2 text-[12px] text-muted">
            Options on the table
          </div>
          <ul>
            {thread.options.map((opt) => (
              <li
                key={opt.id}
                className="px-4 py-3 border-t border-rule first:border-t-0"
              >
                <OptionRow
                  option={opt}
                  usersById={usersById}
                  decided={thread.decision?.optionId === opt.id}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="px-4 py-4 flex flex-col gap-5">
          <div className="text-[12px] text-muted">What the agent's saying</div>
          {thread.messages.map((m) => (
            <div key={m.id} className="flex flex-col">
              <MessageBubble message={m} author={null} isSelf={false} />
              {m.reactions && (
                <div className="pl-3.5">
                  <ReactionStrip
                    reactions={m.reactions}
                    usersById={usersById}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onOpenSpoke}
        className="w-full h-14 px-4 flex items-center justify-between gap-3 border-t border-rule bg-agent-tint/60 hover:bg-agent-tint transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full bg-agent shrink-0" />
          <span className="text-[13px] font-semibold text-agent truncate">
            {yourRatified ? "Talk to Agent 1:1" : "Vent / talk it through 1:1"}
          </span>
        </div>
        <span className="text-[13px] font-medium text-agent shrink-0">
          Open ›
        </span>
      </button>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Decision"
      >
        <h3 className="text-[22px] font-semibold leading-tight text-ink tracking-tight">
          {thread.question}
        </h3>
        <div className="text-[12.5px] text-muted mt-1">
          {isDecided ? "Decided" : "In deliberation"}
        </div>

        <div className="mt-5 border-t border-rule pt-4">
          <div className="text-[12px] text-muted mb-2">
            How decisions work here
          </div>
          <p className="text-[13px] text-ink leading-relaxed">
            You vent privately with the agent. The agent reflects, helps you find
            what you actually mean, asks before sharing anything. Only your ratified
            position becomes visible in the shared view. The shared view is the
            agent's synthesis — you react, you don't type there.
          </p>
        </div>
      </Sheet>
    </div>
  );
};

type OptionRowProps = {
  option: ArbitrationOption;
  usersById: Map<string, User>;
  decided: boolean;
};

const OptionRow = ({ option, usersById, decided }: OptionRowProps) => {
  const proposer =
    option.proposedBy === "agent"
      ? "Agent"
      : usersById.get(option.proposedBy)?.name ?? "—";
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
          decided ? "bg-agent" : "bg-rule"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] leading-snug font-medium text-ink">
          {option.label}
        </div>
        {option.detail && (
          <div className="text-[12px] text-muted mt-0.5">{option.detail}</div>
        )}
        <div className="text-[11.5px] text-muted mt-1">
          Proposed by {proposer}
        </div>
      </div>
    </div>
  );
};
