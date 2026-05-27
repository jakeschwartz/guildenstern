import { useState } from "react";
import { useStore } from "../state/store";
import type { PersonalThread, Thread, User } from "../types";
import { formatRelative } from "../lib/time";
import { Sheet } from "../components/Sheet";

type Props = {
  onOpen: (threadId: string) => void;
  onShowMyCode: () => void;
  onScan: () => void;
};

const lastActivity = (t: Thread): number => {
  if (t.kind === "group") {
    const m = t.messages[t.messages.length - 1];
    return m?.createdAt ?? t.createdAt;
  }
  if (t.kind === "relationship") {
    const all = [...t.privateWithAgent, ...t.outbound];
    return all.length ? Math.max(...all.map((m) => m.createdAt)) : t.createdAt;
  }
  if (t.kind === "partnership") {
    const m = t.messages[t.messages.length - 1];
    return m?.createdAt ?? t.createdAt;
  }
  if (t.kind === "personal") {
    const m = t.messages[t.messages.length - 1];
    return m?.createdAt ?? t.createdAt;
  }
  // arbitration
  const m = t.messages[t.messages.length - 1];
  return m?.createdAt ?? t.createdAt;
};

const previewText = (t: Thread, usersById: Map<string, User>): string => {
  if (t.kind === "group") {
    const m = t.messages[t.messages.length - 1];
    if (!m) return "";
    if (m.author.kind === "agent") return m.body;
    if (m.author.kind === "external") return `${m.author.name}: ${m.body}`;
    const name = usersById.get(m.author.userId)?.name ?? "—";
    return `${name}: ${m.body}`;
  }
  if (t.kind === "relationship") {
    return `${t.contact.role} · ${t.contact.company}`;
  }
  if (t.kind === "partnership") {
    const m = t.messages[t.messages.length - 1];
    if (!m) return "Quiet";
    if (m.author.kind === "agent") return m.body.split("\n")[0]!;
    if (m.author.kind === "external") return `${m.author.name}: ${m.body}`;
    const name = usersById.get(m.author.userId)?.name ?? "—";
    return `${name}: ${m.body}`;
  }
  if (t.kind === "personal") {
    const m = t.messages[t.messages.length - 1];
    if (!m) return "Quiet";
    if (m.author.kind === "agent") return m.body.split("\n")[0]!;
    return m.body;
  }
  // arbitration
  return t.question;
};

export const ThreadList = ({ onOpen, onShowMyCode, onScan }: Props) => {
  const threads = useStore((s) => s.threads);
  const partnerships = useStore((s) => s.partnerships);
  const users = useStore((s) => s.users);
  const currentUserId = useStore((s) => s.currentUserId);
  const usersById = new Map(users.map((u) => [u.id, u]));
  type SheetView = "closed" | "menu" | "connect";
  const [sheetView, setSheetView] = useState<SheetView>("closed");

  // Suppress unused warning when me isn't read elsewhere.
  void usersById.get(currentUserId);

  const partnerNameFor = (partnershipId: string): string | null => {
    const p = partnerships.find((pp) => pp.id === partnershipId);
    if (!p) return null;
    const partnerId =
      p.participantIds[0] === currentUserId
        ? p.participantIds[1]
        : p.participantIds[0];
    return usersById.get(partnerId)?.name ?? null;
  };

  // Personal thread for the current user — pinned at top, always visible.
  const personalThread = threads.find(
    (t): t is PersonalThread =>
      t.kind === "personal" && t.ownerId === currentUserId,
  );

  const otherThreads = threads.filter(
    (t) => !(t.kind === "personal" && t.ownerId === currentUserId),
  );
  // Hide other users' personal threads from this user's list.
  const visibleOthers = otherThreads.filter((t) => t.kind !== "personal");

  const sorted = [...visibleOthers].sort(
    (a, b) => lastActivity(b) - lastActivity(a),
  );

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 pt-11 pb-2 border-b border-rule">
        <span className="text-[12px] text-muted">Threads</span>
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
        {sorted.map((t) => (
          <Row
            key={t.id}
            thread={t}
            currentUserId={currentUserId}
            usersById={usersById}
            partnerNameFor={partnerNameFor}
            preview={previewText(t, usersById)}
            timestamp={formatRelative(lastActivity(t))}
            onOpen={() => onOpen(t.id)}
          />
        ))}
      </div>

      <button
        onClick={() => setSheetView("menu")}
        aria-label="Menu"
        className="absolute bottom-4 right-4 z-20 h-12 w-12 rounded-full bg-ink text-paper shadow-[0_6px_20px_-4px_rgba(0,0,0,0.65)] flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <span className="flex flex-col gap-[3px]">
          <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
          <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
          <span className="block w-[16px] h-[1.5px] bg-current rounded-full" />
        </span>
      </button>

      <Sheet
        open={sheetView !== "closed"}
        onClose={() => setSheetView("closed")}
        title={sheetView === "connect" ? "Connect" : undefined}
      >
        {sheetView === "menu" && (
          <ul className="divide-y divide-rule border-y border-rule -mx-5">
            <li>
              <button
                onClick={() => setSheetView("connect")}
                className="w-full text-left px-5 py-4 hover:bg-card/60 transition-colors flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-[15px] font-semibold text-ink tracking-tight">
                    Connect
                  </div>
                  <div className="text-[12.5px] text-muted mt-0.5">
                    Open a thread with someone you just met
                  </div>
                </div>
                <span className="text-muted text-[14px]">›</span>
              </button>
            </li>
          </ul>
        )}
        {sheetView === "connect" && (
          <>
            <div className="text-[13px] text-muted mb-4 leading-relaxed">
              Show your code, or scan theirs. Either way opens a thread between
              your agents.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setSheetView("closed");
                  onShowMyCode();
                }}
                className="aspect-square rounded-2xl border border-rule bg-card hover:bg-card/60 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="text-[24px] leading-none">▢</span>
                <span className="text-[14px] font-semibold text-ink">
                  My code
                </span>
              </button>
              <button
                onClick={() => {
                  setSheetView("closed");
                  onScan();
                }}
                className="aspect-square rounded-2xl border border-rule bg-card hover:bg-card/60 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <span className="text-[24px] leading-none">⌖</span>
                <span className="text-[14px] font-semibold text-ink">
                  Scan a code
                </span>
              </button>
            </div>
          </>
        )}
      </Sheet>
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

type RowProps = {
  thread: Thread;
  currentUserId: string;
  usersById: Map<string, User>;
  partnerNameFor: (partnershipId: string) => string | null;
  preview: string;
  timestamp: string;
  onOpen: () => void;
};

const Row = ({
  thread,
  currentUserId,
  usersById,
  partnerNameFor,
  preview,
  timestamp,
  onOpen,
}: RowProps) => {
  let title = "";
  let partnerSuffix: string | null = null;
  let topMembers: React.ReactNode = null;
  let status: React.ReactNode = null;
  let awaiting = false;
  let tone: "default" | "deliberation" = "default";

  if (thread.kind === "group") {
    title = thread.title;
    awaiting = Boolean(thread.spokes[currentUserId]?.awaitingMember);
    const members = thread.memberIds
      .map((id) => usersById.get(id))
      .filter((u): u is User => Boolean(u));
    topMembers = (
      <div className="text-[10.5px] tracking-wide text-muted mb-0.5 flex items-center gap-2">
        <span>{members.map((u) => u.initials).join("  ")}</span>
        {thread.agentActive && (
          <span className="ml-auto flex items-center gap-1.5 text-agent">
            <span className="h-1.5 w-1.5 rounded-full bg-agent" />
            Agent
          </span>
        )}
      </div>
    );
  } else if (thread.kind === "relationship") {
    title = thread.contact.name;
    awaiting = thread.intents.some((i) => i.status === "awaiting-you");
    const ratified = thread.intents.filter(
      (i) => i.status === "ratified",
    ).length;
    const pending = thread.intents.filter(
      (i) => i.status !== "ratified" && i.status !== "expired",
    ).length;
    status = (
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        {ratified === 0 && pending === 0 && (
          <span className="flex items-center gap-1.5 text-agent">
            <span className="h-1.5 w-1.5 rounded-full bg-agent" />
            Just connected
          </span>
        )}
        {ratified > 0 && (
          <span className="flex items-center gap-1.5 text-agent">
            <span className="h-1.5 w-1.5 rounded-full bg-agent" />
            {ratified} ratified
          </span>
        )}
        {pending > 0 && (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            {pending} pending
          </span>
        )}
        {thread.agentActive && (
          <span className="ml-auto text-agent">Agent</span>
        )}
      </div>
    );
  } else if (thread.kind === "partnership") {
    const partnerName = partnerNameFor(thread.partnershipId);
    if (thread.isDefault) {
      // Catch-all thread — render as just the partner's name, no suffix.
      title = partnerName ?? thread.title;
    } else {
      title = thread.title;
      partnerSuffix = partnerName;
    }
    const yours = thread.opsCards.filter(
      (c) => c.status === "pending" && c.owner === currentUserId,
    ).length;
    const theirs = thread.opsCards.filter(
      (c) => c.status === "pending" && c.owner !== currentUserId,
    ).length;
    awaiting = yours > 0;
    const partnerFirstName = partnerName?.split(" ")[0] ?? "them";
    if (yours > 0 || theirs > 0) {
      status = (
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
      );
    }
  } else if (thread.kind === "arbitration") {
    title = thread.question;
    partnerSuffix = partnerNameFor(thread.partnershipId);
    const decidedLabel = thread.decision
      ? thread.options.find((o) => o.id === thread.decision?.optionId)?.label
      : null;
    if (!decidedLabel) tone = "deliberation";
    status = (
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        {decidedLabel ? (
          <span className="flex items-center gap-1.5 text-agent">
            <span className="h-1.5 w-1.5 rounded-full bg-agent" />
            Decided · {decidedLabel}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-deliberation">
            <span className="h-1.5 w-1.5 rounded-full bg-deliberation" />
            {thread.positions.length} positions · {thread.options.length}{" "}
            options
          </span>
        )}
      </div>
    );
  } else {
    return null;
  }

  const edgeClass = awaiting
    ? "border-l-2 border-l-attention bg-attention-tint"
    : tone === "deliberation"
      ? "border-l-2 border-l-deliberation"
      : "border-l-2 border-l-transparent";

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left pl-[18px] pr-5 py-3 border-b border-rule hover:bg-card/60 transition-colors ${edgeClass}`}
    >
      {topMembers}
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
      {status}
    </button>
  );
};
