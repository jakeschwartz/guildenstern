import { useEffect, useMemo, useRef, useState } from "react";
import {
  acceptThreadSuggestion,
  dismissOpsCardConflict,
  dismissThreadSuggestion,
  requestOpsCardClarification,
  sendMessage,
  setOpsCardOwner,
  setOpsCardStatus,
  useStore,
} from "../state/store";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { ThreadAnchor } from "../components/ThreadAnchor";
import { Sheet } from "../components/Sheet";
import { Avatar } from "../components/Avatar";
import { formatClock } from "../lib/time";
import { useSwipeBack } from "../hooks/useSwipeBack";
import type { Conflict, OpsBucket, OpsCard, User } from "../types";

type Props = {
  threadId: string;
  onBack: () => void;
  // Navigate to another thread (e.g. the new thread created when a partner
  // accepts Otis's off-topic suggestion). Optional so preview routes can no-op.
  onOpenThread?: (threadId: string) => void;
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
    return { tone: "text-mira", dot: "bg-mira", label: "All caught up" };
  }
  return { tone: "text-mira", dot: "bg-mira", label: "Agent listening" };
};

export const PartnershipThread = ({ threadId, onBack, onOpenThread }: Props) => {
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
  useSwipeBack(onBack, !sheetOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCount =
    thread?.kind === "partnership" ? thread.messages.length : 0;
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messageCount]);

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
  const summary = summarize(
    thread.opsCards,
    currentUserId,
    partner?.name ?? "them",
  );

  return (
    <div className="flex flex-col h-full">
      <ThreadAnchor onBack={onBack} onExpand={() => setSheetOpen(true)}>
        {partner ? (
          <>
            <Avatar initials={partner.initials} size="sm" />
            <span className="text-[17px] font-semibold text-ink truncate tracking-tight">
              {partner.name}
            </span>
          </>
        ) : (
          <span className="text-[17px] font-semibold text-muted truncate tracking-tight">
            Waiting for partner to join…
          </span>
        )}
        {!thread.isDefault && (
          <span className="text-[12px] text-muted shrink-0">
            · {thread.title}
          </span>
        )}
      </ThreadAnchor>

      <button
        onClick={() => setSheetOpen(true)}
        className="w-full h-11 px-4 flex items-center gap-2.5 border-b border-rule text-left hover:bg-card/40 transition-colors"
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${summary.dot}`} />
        <span className={`text-[13px] font-semibold ${summary.tone} truncate`}>
          {summary.label}
        </span>
        <span className="ml-auto text-[11.5px] text-muted shrink-0">
          {thread.opsCards.filter((c) => c.status !== "done").length || "·"} open
        </span>
      </button>

      <div
        ref={scrollRef}
        data-thread-scroll="true"
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none pt-4 flex flex-col gap-4 min-h-0"
        style={{
          paddingLeft: 32,
          paddingRight: 32,
          paddingBottom:
            "calc(72px + var(--kbd-h, 0px) + var(--safe-b, 34px))",
        }}
      >
        {thread.messages.length === 0 && (
          <div className="text-center text-[12.5px] text-muted py-8">
            No messages yet. {partner ? `Say hi to ${partner.name}.` : ""}
          </div>
        )}
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
              onStartThread={async (suggestion) => {
                const newId = await acceptThreadSuggestion(
                  thread.id,
                  m.id,
                  suggestion,
                );
                if (newId) onOpenThread?.(newId);
              }}
              onDismissSuggestion={() =>
                dismissThreadSuggestion(thread.id, m.id)
              }
              onOpenThread={onOpenThread}
            />
          );
        })}
      </div>

      <Composer
        onSend={(body) => {
          if (body.trim()) sendMessage(thread.id, body);
        }}
        placeholder={
          partner ? `Message ${partner.name}` : "Message your partner…"
        }
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Partnership"
      >
        <h3 className="text-[24px] font-semibold leading-tight text-ink tracking-tight">
          {me?.name ?? "You"}
          {partner ? <> &amp; {partner.name}</> : null}
        </h3>
        <div className="text-[12.5px] text-muted mt-1">
          {thread.title} thread · {thread.agentActive ? "agent active" : "agent off"}
        </div>
        <div className="mt-5 border-t border-rule pt-4">
          <div className="smallcaps text-[11px] text-muted mb-3">
            What Otis is tracking
          </div>
          {thread.opsCards.length === 0 ? (
            <div className="text-[12.5px] text-muted italic">
              Nothing here yet. When one of you sends a burst of items, they
              land here for the other to triage.
            </div>
          ) : (
            <OpsQueue
              cards={thread.opsCards}
              currentUserId={currentUserId}
              partnerId={partnerId}
              usersById={usersById}
              threadId={thread.id}
            />
          )}
        </div>
      </Sheet>
    </div>
  );
};

// ============================================================================
// OpsQueue — the triage surface inside the partnership Sheet.
// Groups cards by bucket, tap-to-toggle done, owner pill on the right with
// ↻ re-file to flip ownership. Done cards drop to the bottom of their group
// at half-opacity rather than disappearing — so you can un-do a misclick.
// ============================================================================

const BUCKET_ORDER: OpsBucket[] = ["today", "week", "ongoing", "long"];
const BUCKET_LABELS: Record<OpsBucket, string> = {
  today: "Today",
  week: "This week",
  ongoing: "Ongoing",
  long: "Later",
};

type OpsQueueProps = {
  cards: OpsCard[];
  currentUserId: string;
  partnerId: string;
  usersById: Map<string, User>;
  threadId: string;
};

const OpsQueue = ({
  cards,
  currentUserId,
  partnerId,
  usersById,
  threadId,
}: OpsQueueProps) => {
  // Group + sort: pending first (oldest first), done last (faded).
  const byBucket: Record<OpsBucket, OpsCard[]> = {
    today: [],
    week: [],
    ongoing: [],
    long: [],
  };
  for (const c of cards) {
    byBucket[c.bucket].push(c);
  }
  for (const k of BUCKET_ORDER) {
    byBucket[k].sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.createdAt - b.createdAt;
    });
  }

  const onToggle = (card: OpsCard) => {
    void setOpsCardStatus(
      threadId,
      card.id,
      card.status === "done" ? "pending" : "done",
    );
  };
  const onRefile = (card: OpsCard) => {
    const next = card.owner === currentUserId ? partnerId : currentUserId;
    if (!next) return;
    void setOpsCardOwner(threadId, card.id, next);
  };

  // Which card (if any) currently has its inline "ask for clarification" panel
  // open. Only one at a time — tapping "?" on another card swaps it over.
  const [clarifyingId, setClarifyingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {BUCKET_ORDER.map((bucket) => {
        const group = byBucket[bucket];
        if (group.length === 0) return null;
        return (
          <div key={bucket}>
            <div className="smallcaps text-[10.5px] text-muted mb-1.5">
              {BUCKET_LABELS[bucket]}
            </div>
            <ul className="divide-y divide-rule/60">
              {group.map((card) => {
                const owner = usersById.get(card.owner);
                const ownerInitials = owner?.initials ?? "·";
                const isYours = card.owner === currentUserId;
                const done = card.status === "done";
                const conflict = card.conflictWith;
                const clarification = card.clarification;
                const waitingClarify = clarification?.status === "open";
                const isClarifying = clarifyingId === card.id;
                return (
                  <li
                    key={card.id}
                    className={`py-2.5 ${done ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onToggle(card)}
                        aria-label={done ? "Mark pending" : "Mark done"}
                        className="shrink-0 h-5 w-5 rounded-full border border-rule flex items-center justify-center hover:border-ink transition-colors"
                      >
                        {done && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="12"
                            height="12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-otis"
                          >
                            <polyline points="5 12 10 17 19 8" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => onToggle(card)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div
                          className={`text-[14px] leading-snug flex items-center gap-1.5 ${
                            done ? "line-through text-muted" : "text-ink"
                          }`}
                        >
                          <span className="truncate">{card.title}</span>
                          {conflict && !done && (
                            <span
                              aria-label="Calendar conflict"
                              className="shrink-0 text-attention text-[12px] leading-none"
                            >
                              ⚠
                            </span>
                          )}
                        </div>
                        {(card.when || card.subtitle) && (
                          <div className="text-[11.5px] text-muted mt-0.5">
                            {card.when}
                            {card.when && card.subtitle && " · "}
                            {card.subtitle}
                          </div>
                        )}
                      </button>
                      {!done && !waitingClarify && (
                        <button
                          onClick={() =>
                            setClarifyingId(isClarifying ? null : card.id)
                          }
                          aria-label="Ask for clarification"
                          title="Doesn't make sense? Ask your partner"
                          className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
                            isClarifying
                              ? "bg-otis text-paper"
                              : "bg-card text-muted hover:text-ink"
                          }`}
                        >
                          ?
                        </button>
                      )}
                      <button
                        onClick={() => onRefile(card)}
                        aria-label={isYours ? "Send to partner" : "Take it"}
                        title={isYours ? "Send to partner" : "Take it"}
                        className={`shrink-0 h-6 px-1.5 rounded-md flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                          isYours
                            ? "bg-attention-tint text-attention"
                            : "bg-card text-muted hover:text-ink"
                        }`}
                      >
                        <span>{ownerInitials}</span>
                        <span aria-hidden className="opacity-50">↻</span>
                      </button>
                    </div>
                    {conflict && !done && (
                      <ConflictPanel
                        card={card}
                        conflict={conflict}
                        currentUserId={currentUserId}
                        partnerId={partnerId}
                        usersById={usersById}
                        threadId={threadId}
                      />
                    )}
                    {isClarifying && !waitingClarify && (
                      <ClarifyPanel
                        card={card}
                        partnerId={partnerId}
                        usersById={usersById}
                        threadId={threadId}
                        onClose={() => setClarifyingId(null)}
                      />
                    )}
                    {waitingClarify && clarification && (
                      <ClarifyWaiting
                        clarification={clarification}
                        currentUserId={currentUserId}
                        partnerId={partnerId}
                        usersById={usersById}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// ConflictPanel — inline calendar-conflict callout shown beneath a Sheet row
// when Otis has detected a collision. Loud on purpose: this is where Otis
// earns his keep, by catching what humans miss. Three resolution actions:
// flip ownership to the partner, mark "move the time" (no-op for v0 — Otis
// would re-burst with a new time in real life), or "keep both" (acknowledge
// and dismiss).
// ============================================================================

type ConflictPanelProps = {
  card: OpsCard;
  conflict: Conflict;
  currentUserId: string;
  partnerId: string;
  usersById: Map<string, User>;
  threadId: string;
};

const ConflictPanel = ({
  card,
  conflict,
  currentUserId,
  partnerId,
  usersById,
  threadId,
}: ConflictPanelProps) => {
  const partner = usersById.get(partnerId);
  const isOnYourCal = conflict.calendarOwnerId === currentUserId;
  const otherFirstName = (partner?.name ?? "your partner").split(" ")[0];

  const handPartnerTakeIt = () => {
    void setOpsCardOwner(threadId, card.id, partnerId);
    dismissOpsCardConflict(threadId, card.id);
  };
  const handleMoveTime = () => {
    // Stub for v0: in the real flow Otis would prompt for a new time and
    // re-emit the card. Here we just clear the conflict flag so the card
    // stays in the queue as-is.
    dismissOpsCardConflict(threadId, card.id);
  };
  const handleKeepBoth = () => {
    dismissOpsCardConflict(threadId, card.id);
  };

  const timeRange = `${formatClock(conflict.eventStart)} – ${formatClock(
    conflict.eventEnd,
  )}`;

  return (
    <div className="ml-8 mt-2 rounded-lg border border-attention/30 bg-attention-tint/40 px-3 py-2.5">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-attention text-[11px] leading-none">⚠</span>
        <span className="text-[12px] font-semibold text-ink">
          Conflicts with {conflict.eventTitle}
        </span>
        <span className="text-[11.5px] text-muted">
          {isOnYourCal ? "on your calendar" : `on ${otherFirstName}'s calendar`}
        </span>
      </div>
      <div className="text-[11.5px] text-muted mt-0.5">{timeRange}</div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          onClick={handPartnerTakeIt}
          className="h-7 px-2.5 rounded-md bg-ink text-paper text-[11.5px] font-semibold tracking-tight hover:opacity-90 transition-opacity"
        >
          {otherFirstName} takes it
        </button>
        <button
          onClick={handleMoveTime}
          className="h-7 px-2.5 rounded-md border border-rule text-ink text-[11.5px] font-semibold tracking-tight hover:bg-card/60 transition-colors"
        >
          Move time
        </button>
        <button
          onClick={handleKeepBoth}
          className="h-7 px-2.5 rounded-md text-muted text-[11.5px] font-semibold tracking-tight hover:text-ink transition-colors"
        >
          Keep both
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// ClarifyPanel — inline "this doesn't make sense, ask my partner" affordance
// shown beneath a Sheet row when the "?" is tapped. The note is optional: a
// one-tap "Ask" sends a generic nudge, or you can type what's unclear. On send,
// Otis relays the question into the thread (so the partner sees the ask), and
// the card flips to a "waiting on clarification" chip.
// ============================================================================

type ClarifyPanelProps = {
  card: OpsCard;
  partnerId: string;
  usersById: Map<string, User>;
  threadId: string;
  onClose: () => void;
};

const ClarifyPanel = ({
  card,
  partnerId,
  usersById,
  threadId,
  onClose,
}: ClarifyPanelProps) => {
  const [note, setNote] = useState("");
  const partner = usersById.get(partnerId);
  const partnerFirst = (partner?.name ?? "your partner").split(" ")[0];

  const handleAsk = () => {
    void requestOpsCardClarification(threadId, card.id, note.trim());
    onClose();
  };

  return (
    <div className="ml-8 mt-2 rounded-lg border border-otis/30 bg-otis-tint/40 px-3 py-2.5">
      <div className="text-[12px] font-semibold text-ink">
        Ask {partnerFirst} about this
      </div>
      <div className="text-[11.5px] text-muted mt-0.5">
        Otis will relay your question into the thread.
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAsk();
        }}
        autoFocus
        placeholder="What's unclear? (optional)"
        className="mt-2 w-full h-8 px-2.5 rounded-md border border-rule bg-paper text-[12.5px] text-ink placeholder:text-muted focus:outline-none focus:border-otis"
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          onClick={handleAsk}
          className="h-7 px-2.5 rounded-md bg-ink text-paper text-[11.5px] font-semibold tracking-tight hover:opacity-90 transition-opacity"
        >
          Ask {partnerFirst}
        </button>
        <button
          onClick={onClose}
          className="h-7 px-2.5 rounded-md text-muted text-[11.5px] font-semibold tracking-tight hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// ClarifyWaiting — the "waiting on clarification" chip shown beneath a row once
// a clarification has been asked. Names whoever still owes the answer and echoes
// the note. No resolve button: the chip clears automatically when the person
// being asked posts their next message in the thread (auto-resolve, handled by
// sendMessage optimistically + a backend trigger canonically).
// ============================================================================

type ClarifyWaitingProps = {
  clarification: NonNullable<OpsCard["clarification"]>;
  currentUserId: string;
  partnerId: string;
  usersById: Map<string, User>;
};

const ClarifyWaiting = ({
  clarification,
  currentUserId,
  partnerId,
  usersById,
}: ClarifyWaitingProps) => {
  const askedByMe = clarification.askedByUserId === currentUserId;
  const partner = usersById.get(partnerId);
  const partnerFirst = (partner?.name ?? "your partner").split(" ")[0];

  return (
    <div className="ml-8 mt-2 rounded-lg border border-otis/25 bg-otis-tint/25 px-3 py-2 flex items-start gap-2">
      <span className="text-otis text-[11px] leading-none mt-0.5">⏳</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-ink">
          {askedByMe
            ? `Waiting on ${partnerFirst} to clarify`
            : `${partnerFirst} asked you to clarify — reply in the thread`}
        </div>
        {clarification.note && (
          <div className="text-[11.5px] text-muted mt-0.5 italic">
            “{clarification.note}”
          </div>
        )}
      </div>
    </div>
  );
};
