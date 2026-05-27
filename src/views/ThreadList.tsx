import { useStore } from "../state/store";
import type { PartnershipThread, PersonalThread, User } from "../types";
import { formatRelative } from "../lib/time";

type Props = {
  onOpen: (threadId: string) => void;
  onBack: () => void;
};

const lastActivity = (t: PartnershipThread | PersonalThread): number => {
  const m = t.messages[t.messages.length - 1];
  return m?.createdAt ?? t.createdAt;
};

const previewText = (
  t: PartnershipThread | PersonalThread,
  usersById: Map<string, User>,
): string => {
  const m = t.messages[t.messages.length - 1];
  if (!m) return t.kind === "personal" ? "Quiet" : "Quiet";
  if (m.author.kind === "agent") return m.body.split("\n")[0]!;
  const name = usersById.get(m.author.userId)?.name ?? "—";
  return `${name}: ${m.body}`;
};

export const ThreadList = ({ onOpen, onBack }: Props) => {
  const threads = useStore((s) => s.threads);
  const partnerships = useStore((s) => s.partnerships);
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = new Map(users.map((u) => [u.id, u]));

  const partnerNameFor = (partnershipId: string): string | null => {
    const p = partnerships.find((pp) => pp.id === partnershipId);
    if (!p) return null;
    const partnerId =
      p.participantIds[0] === currentUserId
        ? p.participantIds[1]
        : p.participantIds[0];
    return usersById.get(partnerId)?.name ?? null;
  };

  const personalThread = threads.find(
    (t): t is PersonalThread =>
      t.kind === "personal" && t.ownerId === currentUserId,
  );

  const partnershipThreads = threads
    .filter((t): t is PartnershipThread => t.kind === "partnership")
    .sort((a, b) => lastActivity(b) - lastActivity(a));

  return (
    <div className="flex flex-col h-full">
      <header className="pl-2 pr-5 pt-11 pb-2 border-b border-rule flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back"
          className="h-11 w-11 flex items-center justify-center text-muted hover:text-ink"
        >
          <span className="text-[18px] leading-none">←</span>
        </button>
        <span className="text-[12px] text-muted">All threads</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {personalThread && (
          <AgentRow
            thread={personalThread}
            preview={previewText(personalThread, usersById)}
            timestamp={formatRelative(lastActivity(personalThread))}
            onOpen={() => onOpen(personalThread.id)}
          />
        )}
        {partnershipThreads.map((t) => (
          <PartnershipRow
            key={t.id}
            thread={t}
            currentUserId={currentUserId}
            partnerName={partnerNameFor(t.partnershipId)}
            preview={previewText(t, usersById)}
            timestamp={formatRelative(lastActivity(t))}
            onOpen={() => onOpen(t.id)}
          />
        ))}
        {partnershipThreads.length === 0 && (
          <div className="px-5 py-10 text-center text-[12.5px] text-muted">
            No partnerships yet.
          </div>
        )}
      </div>
    </div>
  );
};

type AgentRowProps = {
  thread: PersonalThread;
  preview: string;
  timestamp: string;
  onOpen: () => void;
};

const AgentRow = ({ thread, preview, timestamp, onOpen }: AgentRowProps) => {
  const last = thread.messages[thread.messages.length - 1];
  const lastIsAgent = last?.author.kind === "agent";
  return (
    <button
      onClick={onOpen}
      className="w-full text-left pl-[18px] pr-5 py-3.5 border-b border-rule hover:bg-card/60 transition-colors border-l-2 border-l-agent-edge bg-agent-tint"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full bg-agent shrink-0" />
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Agent
        </span>
        {lastIsAgent && (
          <span className="text-[11px] text-agent ml-1">just now</span>
        )}
        <span className="ml-auto text-[11px] text-muted">{timestamp}</span>
      </div>
      <div className="text-[12.5px] text-muted line-clamp-2">{preview}</div>
    </button>
  );
};

type PartnershipRowProps = {
  thread: PartnershipThread;
  currentUserId: string;
  partnerName: string | null;
  preview: string;
  timestamp: string;
  onOpen: () => void;
};

const PartnershipRow = ({
  thread,
  currentUserId,
  partnerName,
  preview,
  timestamp,
  onOpen,
}: PartnershipRowProps) => {
  const title = thread.isDefault ? partnerName ?? thread.title : thread.title;
  const partnerSuffix = thread.isDefault ? null : partnerName;
  const yours = thread.opsCards.filter(
    (c) => c.status === "pending" && c.owner === currentUserId,
  ).length;
  const theirs = thread.opsCards.filter(
    (c) => c.status === "pending" && c.owner !== currentUserId,
  ).length;
  const awaiting = yours > 0;
  const partnerFirstName = partnerName?.split(" ")[0] ?? "them";

  const edgeClass = awaiting
    ? "border-l-2 border-l-attention bg-attention-tint"
    : "border-l-2 border-l-transparent";

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left pl-[18px] pr-5 py-3 border-b border-rule hover:bg-card/60 transition-colors ${edgeClass}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[16px] font-semibold tracking-tight text-ink truncate">
            {title}
          </span>
          {partnerSuffix && (
            <span className="text-[12px] text-muted shrink-0">
              with {partnerSuffix}
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted shrink-0">{timestamp}</span>
      </div>
      <div className="mt-0.5 text-[12.5px] text-muted line-clamp-1">
        {preview}
      </div>
      {(yours > 0 || theirs > 0) && (
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          {yours > 0 && (
            <span className="flex items-center gap-1.5 text-attention">
              <span className="h-1.5 w-1.5 rounded-full bg-attention" />
              {yours} on you
            </span>
          )}
          {theirs > 0 && (
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              {theirs} on {partnerFirstName}
            </span>
          )}
        </div>
      )}
    </button>
  );
};
