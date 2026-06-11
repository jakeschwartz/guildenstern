import { useEffect, useMemo, useRef, useState } from "react";
import {
  dismissOpsCardConflict,
  refreshCalendarEvents,
  sendMessage,
  setOpsCardOwner,
  setOpsCardStatus,
  toggleReaction,
  useStore,
} from "../state/store";
import { Voice } from "../components/Voice";
import { sendTyping, subscribeTyping } from "../lib/typing";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { ThreadAnchor } from "../components/ThreadAnchor";
import { Sheet } from "../components/Sheet";
import { Avatar } from "../components/Avatar";
import { formatClock } from "../lib/time";
import {
  getCachedSpokeSummary,
  refreshSpokeSummary,
  subscribeToSpokeSummary,
} from "../lib/synthesize";
import type {
  Conflict,
  Message,
  OpsBucket,
  OpsCard,
  SpokeSectionItemStatus,
  SpokeSummary,
  User,
} from "../types";

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
    return { tone: "text-otis", dot: "bg-otis", label: "All caught up" };
  }
  return { tone: "text-otis", dot: "bg-otis", label: "Otis listening" };
};

// The six iMessage tapbacks, in iMessage's order.
const TAPBACK_EMOJI = ["❤️", "👍", "👎", "😂", "‼️", "❓"];

// Long-press detector. Fires onLongPress after 450ms of steady touch; any
// movement or release cancels. Suppresses the iOS text-selection callout so
// the press feels native.
const LongPress = ({
  onLongPress,
  children,
}: {
  onLongPress: () => void;
  children: React.ReactNode;
}) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    timer.current = setTimeout(onLongPress, 450);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div
      onTouchStart={start}
      onTouchMove={cancel}
      onTouchEnd={cancel}
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress();
      }}
      style={{
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
};

// Carousel pane indices. Center (CHAT) is the default. SWIPE-RIGHT goes
// to PANE_ITEMS (the active queue you triage), SWIPE-LEFT goes to
// PANE_CONTEXT (the slower-moving topic context: Calendar for the main
// partnership thread; "Where we are" synthesis for spokes).
const PANE_ITEMS = 0;
const PANE_CHAT = 1;
const PANE_CONTEXT = 2;

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
  const [paneIndex, setPaneIndex] = useState(PANE_CHAT);
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCount =
    thread?.kind === "partnership" ? thread.messages.length : 0;
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messageCount]);
  // On first render: jump the carousel to the chat pane so the user lands on
  // the conversation, not on calendar. Use scrollLeft directly (no smooth)
  // because the user hasn't seen any animation yet — instant placement.
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollLeft = el.clientWidth * PANE_CHAT;
  }, []);
  // Programmatic pane navigation (tap a dot, tap the status strip, etc.)
  const goToPane = (idx: number) => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * idx, behavior: "smooth" });
  };
  // Sync paneIndex from scroll position so the dot indicator follows finger.
  const onCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w === 0) return;
    const idx = Math.round(el.scrollLeft / w);
    if (idx !== paneIndex) setPaneIndex(idx);
  };

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

  // Group cards by their source message so we can render them inline as a
  // "routed burst" at the message's position in the thread (per-party render).
  const cardsByMessage = useMemo(() => {
    const map = new Map<string, OpsCard[]>();
    for (const c of thread.opsCards) {
      const arr = map.get(c.sourceMessageId);
      if (arr) arr.push(c);
      else map.set(c.sourceMessageId, [c]);
    }
    return map;
  }, [thread.opsCards]);

  // Tapbacks, grouped per message for render.
  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, { userId: string; emoji: string }[]>();
    for (const r of thread.reactions ?? []) {
      const arr = map.get(r.messageId);
      if (arr) arr.push(r);
      else map.set(r.messageId, [r]);
    }
    return map;
  }, [thread.reactions]);

  // Which message the tapback picker is open for (long-press to open).
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  // Which message we're replying to (quote shown in the composer).
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Typing indicator: which partner ids are currently typing in this thread.
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  useEffect(() => {
    const unsub = subscribeTyping(thread.id, (ids) =>
      setTypingUserIds(ids.filter((id) => id !== currentUserId)),
    );
    return unsub;
  }, [thread.id, currentUserId]);
  const typingPartner =
    typingUserIds.length > 0 ? usersById.get(typingUserIds[0]!) : undefined;

  // Fast lookup for rendering quoted snippets above reply bubbles.
  const messagesById = useMemo(() => {
    const map = new Map<string, (typeof thread.messages)[number]>();
    for (const m of thread.messages) map.set(m.id, m);
    return map;
  }, [thread.messages]);

  // Short label + snippet for a quoted message.
  const quoteFor = (messageId: string) => {
    const q = messagesById.get(messageId);
    if (!q) return null;
    const name =
      q.author.kind === "agent"
        ? "Otis"
        : q.author.userId === currentUserId
          ? "You"
          : usersById.get(q.author.userId)?.name?.split(" ")[0] ?? "Partner";
    const snippet =
      q.body.trim().length > 0
        ? q.body
        : (q.attachments?.length ?? 0) > 0
          ? "📷 Photo"
          : "";
    return { name, snippet };
  };

  return (
    // Bound the chat area ABOVE the composer (and keyboard). Was: chat
    // extended to viewport bottom and we tried to pad-bottom by the composer
    // height — fragile, easy to undercount, and the last bubble kept getting
    // hidden behind the composer. Now the root container's paddingBottom
    // matches the composer's footprint exactly. Composer (position:fixed)
    // floats in that bottom band; chat ends at the composer's top edge.
    <div
      className="flex flex-col h-full"
      style={{
        paddingBottom:
          "calc(var(--composer-h, 56px) + var(--kbd-h, 0px) + var(--safe-b, 34px))",
      }}
    >
      <ThreadAnchor onBack={onBack} onExpand={() => setSheetOpen(true)}>
        {partner ? (
          <>
            <div className="relative shrink-0">
              <Avatar initials={partner.initials} size="sm" />
              <div className="absolute -bottom-1 -right-1 ring-2 ring-paper rounded-squircle">
                <Avatar initials="O" size="sm" voice="otis" />
              </div>
            </div>
            {thread.isDefault ? (
              <>
                <span className="text-[17px] font-semibold text-ink truncate tracking-tight ml-1">
                  {partner.name}
                </span>
                <span className="smallcaps text-[10px] text-otis ml-1 shrink-0">
                  partnership
                </span>
              </>
            ) : (
              <>
                {/* Spoke header: topic title is the headline; partner is
                    shown as secondary context ("with Jenny"). */}
                <div className="flex flex-col min-w-0 ml-1">
                  <span className="text-[16px] font-semibold text-ink truncate tracking-tight">
                    {thread.title}
                  </span>
                  <span className="text-[10.5px] text-muted truncate -mt-0.5">
                    with {partner.name.split(" ")[0]}
                  </span>
                </div>
                <span className="smallcaps text-[10px] text-otis ml-1 shrink-0">
                  focused
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-[17px] font-semibold text-muted truncate tracking-tight">
            Waiting for partner to join…
          </span>
        )}
      </ThreadAnchor>

      <button
        onClick={() => goToPane(PANE_ITEMS)}
        className="w-full h-11 px-4 flex items-center gap-2.5 border-b border-rule text-left hover:bg-card/40 transition-colors"
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${summary.dot}`} />
        <span className={`text-[13px] font-semibold ${summary.tone} truncate`}>
          {summary.label}
        </span>
        <span className="ml-auto text-[11.5px] text-muted shrink-0">
          {thread.opsCards.filter((c) => c.status !== "done").length || "·"} tracked
        </span>
      </button>

      {/* Page-indicator dots. Tap any dot to jump to that pane.
          Order matches carousel: items (left) · chat (center) · context (right). */}
      <div className="flex items-center justify-center gap-1.5 py-1.5 border-b border-rule shrink-0">
        {[PANE_ITEMS, PANE_CHAT, PANE_CONTEXT].map((i) => (
          <button
            key={i}
            onClick={() => goToPane(i)}
            aria-label={
              i === PANE_ITEMS
                ? "Items"
                : i === PANE_CHAT
                  ? "Chat"
                  : thread.isDefault
                    ? "Calendar"
                    : "Where we are"
            }
            className={`h-1.5 rounded-full transition-all ${
              paneIndex === i ? "w-6 bg-ink" : "w-1.5 bg-rule hover:bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Three-pane horizontal carousel. Center pane = chat (default).
          Swipe RIGHT (finger right) → items queue (left pane, the active
          triage surface). Swipe LEFT (finger left) → context (right pane:
          Calendar in the main partnership thread, "Where we are" in spokes).
          CSS scroll-snap handles snapping; we listen on scroll to update dots. */}
      <div
        ref={carouselRef}
        onScroll={onCarouselScroll}
        className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory min-h-0"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Pane 0 — Items queue (leftmost). The active triage surface. */}
        <div
          className="w-full shrink-0 snap-start overflow-y-auto"
          style={{ paddingBottom: "16px" }}
        >
          <div className="px-5 pt-5">
            <div className="smallcaps text-[11px] text-muted mb-3">
              What Otis is tracking
            </div>
            {thread.opsCards.length === 0 ? (
              <div className="text-[12.5px] text-muted italic">
                Nothing here yet. When one of you sends a burst of items,
                they land here for the other to triage.
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
        </div>

        {/* Pane 1 — Chat. The original message stream, untouched. */}
        <div
          ref={scrollRef}
          data-thread-scroll="true"
          className="w-full shrink-0 snap-start overflow-y-auto pt-4 flex flex-col gap-4"
          style={{
            paddingLeft: 32,
            paddingRight: 32,
            paddingBottom:
              "16px",
          }}
        >
        {thread.messages.length === 0 && (
          <div className="text-center text-[12.5px] text-muted py-8">
            No messages yet. {partner ? `Say hi to ${partner.name}.` : ""}
          </div>
        )}
        {thread.messages
          // Chat stays a chat. Hide Otis's NOISE — burst echoes ("Got it —
          // A, B, C. Sound right?") and running summaries ("Jenny's got:",
          // "Jake done:", "Jake passed X to Y"). Those live in the items
          // pane and the status strip; they don't speak in conversation.
          //
          // BUT keep Otis's conversational responses (when one of you
          // addresses him directly: "Otis, what do you think?"). Those are
          // the moments Otis is in the room talking with you.
          .filter((m) => {
            // Hide messages that belong to the talk-to-Otis conversation
            // on the synthesis pane — they have their own surface there.
            if (m.context === "otis_chat") return false;
            if (m.author.kind === "human") return true;
            const body = m.body;
            if (/^got it[\s—-]/i.test(body)) return false; // burst echo
            // Running summaries: "Name's got:", "Name done:", "Name passed"
            if (/^[\w'-]+(?:'s got: | done: | passed )/i.test(body))
              return false;
            return true;
          })
          .map((m) => {
            const author =
              m.author.kind === "human"
                ? usersById.get(m.author.userId) ?? null
                : null;
            const isSelf =
              m.author.kind === "human" && m.author.userId === currentUserId;
            const cardsFromThis = cardsByMessage.get(m.id);
            const itemCount = cardsFromThis?.length ?? 0;
            const reactions = reactionsByMessage.get(m.id) ?? [];
            const side = isSelf ? "self-end" : "self-start";
            return (
              <div key={m.id} className="flex flex-col gap-1">
                {/* Long-press menu: tapback emoji row + a Reply action. */}
                {reactingTo === m.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setReactingTo(null)}
                    />
                    <div className={`${side} z-50 flex flex-col gap-1`}>
                      <div className="flex gap-0.5 bg-card ring-1 ring-rule rounded-full px-2 py-1.5 shadow-lg">
                        {TAPBACK_EMOJI.map((e) => (
                          <button
                            key={e}
                            onClick={() => {
                              void toggleReaction(thread.id, m.id, e);
                              setReactingTo(null);
                            }}
                            className="text-[22px] px-1.5 active:scale-125 transition-transform"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setReplyingTo(m.id);
                          setReactingTo(null);
                        }}
                        className={`${isSelf ? "self-end" : "self-start"} flex items-center gap-1.5 bg-card ring-1 ring-rule rounded-full px-3 py-1.5 shadow-lg text-[13px] text-ink`}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 17 4 12 9 7" />
                          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                        </svg>
                        Reply
                      </button>
                    </div>
                  </>
                )}
                {/* Quoted message above the bubble when this is a reply. */}
                {m.replyToMessageId &&
                  (() => {
                    const q = quoteFor(m.replyToMessageId);
                    if (!q) return null;
                    return (
                      <div
                        className={`${side} flex items-stretch gap-1.5 max-w-[80%] opacity-70`}
                      >
                        <div className="w-0.5 rounded-full bg-rule shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10.5px] font-semibold text-muted">
                            {q.name}
                          </div>
                          <div className="text-[12px] text-muted truncate">
                            {q.snippet}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                <LongPress onLongPress={() => setReactingTo(m.id)}>
                  <MessageBubble
                    message={m}
                    author={author}
                    isSelf={isSelf}
                  />
                </LongPress>
                {/* Tapbacks on this message. Tap a pill to open the picker
                    (swap/remove your reaction). */}
                {reactions.length > 0 && (
                  <button
                    onClick={() => setReactingTo(m.id)}
                    className={`${side} -mt-0.5 flex items-center gap-0.5 bg-card ring-1 ring-rule rounded-full px-2 py-0.5 text-[14px]`}
                  >
                    {reactions.map((r) => (
                      <span key={`${r.userId}-${r.emoji}`}>{r.emoji}</span>
                    ))}
                  </button>
                )}
                {/* Agent read receipt — a tiny green check once Otis has
                    processed the message (every message, both sides), with
                    a count when items were tracked (tap → items pane).
                    Sent → delivered → tracked. */}
                {itemCount > 0 ? (
                  <button
                    onClick={() => goToPane(PANE_ITEMS)}
                    aria-label={`Otis tracked ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
                    className={`${side} flex items-center gap-0.5 text-[10.5px] font-semibold text-otis leading-none`}
                  >
                    <span aria-hidden>✓</span>
                    <span>{itemCount}</span>
                  </button>
                ) : m.agentProcessedAt ? (
                  <span
                    aria-label="Otis saw this"
                    className={`${side} text-[10.5px] font-semibold text-otis/70 leading-none`}
                  >
                    ✓
                  </span>
                ) : null}
              </div>
            );
          })}
        {/* Typing indicator — three dots in a partner-side bubble while
            they're composing. Ephemeral (Realtime broadcast, not persisted). */}
        {typingPartner && (
          <div className="self-start flex flex-col gap-1 max-w-[92%]">
            <span className="text-[13px] font-semibold text-ink">
              {typingPartner.name}
            </span>
            <div className="bg-card rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:-0.3s]" />
              <span className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:-0.15s]" />
              <span className="h-2 w-2 rounded-full bg-muted animate-bounce" />
            </div>
          </div>
        )}
        </div>

        {/* Pane 2 — Context (rightmost). Calendar (your Google events) in
            the main partnership thread; Otis's topic-aware "Where we are"
            synthesis in a spoke. */}
        <div
          className="w-full shrink-0 snap-start overflow-y-auto"
          style={{ scrollbarGutter: "stable" }}
        >
          {thread.isDefault ? (
            <CalendarPane />
          ) : (
            <WhereWeArePane
              threadId={thread.id}
              title={thread.title}
              otisChatMessages={thread.messages.filter(
                (m) => m.context === "otis_chat",
              )}
              currentUserId={currentUserId}
              usersById={usersById}
            />
          )}
        </div>
      </div>

      {/* One composer, fixed-bottom. Its behavior changes based on which
          pane the user is currently on:
          - Chat pane: messages go to the partner-to-partner chat.
          - Synthesis pane (in a spoke): messages go to Otis (shared).
          - Items pane: hidden — that's a pure triage surface. */}
      {paneIndex === PANE_CHAT && (
        <Composer
          threadId={thread.id}
          replyPreview={replyingTo ? quoteFor(replyingTo) : null}
          onCancelReply={() => setReplyingTo(null)}
          onTyping={(t) => sendTyping(thread.id, currentUserId, t)}
          onSend={(body, attachments) => {
            if (body.trim() || (attachments && attachments.length > 0)) {
              sendMessage(thread.id, body, "main", attachments, replyingTo);
              setReplyingTo(null);
            }
          }}
          placeholder={
            partner ? `Message ${partner.name}` : "Message your partner…"
          }
        />
      )}
      {paneIndex === PANE_CONTEXT && !thread.isDefault && (
        <Composer
          threadId={thread.id}
          onSend={(body, attachments) => {
            if (body.trim() || (attachments && attachments.length > 0))
              sendMessage(thread.id, body, "otis_chat", attachments);
          }}
          placeholder={
            partner
              ? `Ask Otis (${partner.name.split(" ")[0]} sees)`
              : "Ask Otis"
          }
        />
      )}

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
// CalendarPane — left swipe pane in the partnership carousel. Shows YOUR
// Google Calendar events grouped by Today / Tomorrow / This week / Later.
// Purely display — partnership items live in the chat + queue panes; conflict
// detection happens server-side and surfaces ⚠ on the cards themselves.
// ============================================================================

// Day-bucket the events. "Today" = same calendar date as now; "Tomorrow" =
// next calendar date; "This week" = the next 7 days minus today/tomorrow;
// "Later" = beyond that.
const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const dayBucketFor = (
  eventStart: number,
  todayStart: number,
): "today" | "tomorrow" | "thisWeek" | "later" => {
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((startOfDay(eventStart) - todayStart) / dayMs);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return "thisWeek";
  return "later";
};

const fmtTime = (ms: number): string => {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
};

const fmtDayLabel = (ms: number): string => {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

const CalendarPane = () => {
  const calendarEvents = useStore((s) => s.calendarEvents);
  const fetchedAt = useStore((s) => s.calendarEventsFetchedAt);

  // Trigger a fetch on mount (and once on mount only — the user can pull-down
  // later if we add that gesture). Idempotent + cheap.
  useEffect(() => {
    void refreshCalendarEvents();
  }, []);

  // Refresh if cached fetch is stale (>5 min). Avoids fetching on every
  // re-mount when the user swipes between panes.
  useEffect(() => {
    const STALE_MS = 5 * 60 * 1000;
    if (fetchedAt && Date.now() - fetchedAt < STALE_MS) return;
    void refreshCalendarEvents();
  }, [fetchedAt]);

  const todayStart = startOfDay(Date.now());

  const groups: Record<
    "today" | "tomorrow" | "thisWeek" | "later",
    typeof calendarEvents
  > = { today: [], tomorrow: [], thisWeek: [], later: [] };
  for (const e of calendarEvents) {
    groups[dayBucketFor(e.start, todayStart)].push(e);
  }

  if (calendarEvents.length === 0) {
    return (
      <div className="px-5 pt-8 pb-12 text-center text-[12.5px] text-muted leading-relaxed">
        <div className="smallcaps text-[10.5px] text-otis mb-3">your day</div>
        Connect Google Calendar in the menu to see your events here.
      </div>
    );
  }

  // For "This week", subgroup by day so each weekday gets its own heading.
  const thisWeekByDay = new Map<number, typeof calendarEvents>();
  for (const e of groups.thisWeek) {
    const k = startOfDay(e.start);
    const arr = thisWeekByDay.get(k);
    if (arr) arr.push(e);
    else thisWeekByDay.set(k, [e]);
  }
  const thisWeekOrdered = Array.from(thisWeekByDay.entries()).sort(
    (a, b) => a[0] - b[0],
  );

  const renderEvent = (e: (typeof calendarEvents)[number]) => (
    <li key={e.id} className="py-2 flex items-baseline gap-3">
      <div className="shrink-0 w-14 text-[11.5px] text-muted font-medium tabular-nums">
        {e.allDay ? "all day" : fmtTime(e.start)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-ink leading-snug truncate">
          {e.title}
        </div>
        {e.location && (
          <div className="text-[11.5px] text-muted truncate mt-0.5">
            {e.location}
          </div>
        )}
      </div>
    </li>
  );

  return (
    <div className="px-5 pt-5 pb-12 flex flex-col gap-6">
      <div className="smallcaps text-[10.5px] text-otis">your day</div>

      {groups.today.length > 0 && (
        <div>
          <div className="text-[15px] font-semibold text-ink tracking-tight mb-2">
            Today
          </div>
          <ul className="divide-y divide-rule/60">
            {groups.today.map(renderEvent)}
          </ul>
        </div>
      )}

      {groups.tomorrow.length > 0 && (
        <div>
          <div className="text-[15px] font-semibold text-ink tracking-tight mb-2">
            Tomorrow
          </div>
          <ul className="divide-y divide-rule/60">
            {groups.tomorrow.map(renderEvent)}
          </ul>
        </div>
      )}

      {thisWeekOrdered.length > 0 && (
        <div>
          <div className="text-[15px] font-semibold text-ink tracking-tight mb-2">
            This week
          </div>
          <div className="flex flex-col gap-4">
            {thisWeekOrdered.map(([dayStart, events]) => (
              <div key={dayStart}>
                <div className="smallcaps text-[10.5px] text-muted mb-1">
                  {fmtDayLabel(dayStart)}
                </div>
                <ul className="divide-y divide-rule/60">
                  {events.map(renderEvent)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.later.length > 0 && (
        <div>
          <div className="text-[15px] font-semibold text-ink tracking-tight mb-2">
            Later
          </div>
          <ul className="divide-y divide-rule/60">
            {groups.later.map(renderEvent)}
          </ul>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// WhereWeArePane — swipe-left pane for SPOKES (non-default partnership
// threads). Otis writes a topic-aware synthesis: a 1-3 sentence summary
// plus N sections he names after what's actually being discussed ("Invite
// list", "Venue", "Date" for a party — not generic "Decided/Open").
// Auto-refreshes on mount if the cached version is >5min old; manual
// Refresh button always available.
// ============================================================================

const STATUS_GLYPH: Record<SpokeSectionItemStatus, string> = {
  done: "✓",
  open: "·",
  maybe: "?",
  action: "→",
  flagged: "⚠",
};

const STATUS_COLOR: Record<SpokeSectionItemStatus, string> = {
  done: "text-otis",
  open: "text-muted",
  maybe: "text-muted",
  action: "text-attention",
  flagged: "text-attention",
};

const fmtAgo = (ms: number): string => {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

const STALE_MS = 5 * 60 * 1000;

type WhereWeArePaneProps = {
  threadId: string;
  title: string;
  otisChatMessages: Message[];
  currentUserId: string;
  usersById: Map<string, User>;
};

const WhereWeArePane = ({
  threadId,
  title,
  otisChatMessages,
  currentUserId,
  usersById,
}: WhereWeArePaneProps) => {
  const [summary, setSummary] = useState<SpokeSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: read the cached row instantly. If stale, ask the server to
  // refresh in the background. Subscribe to realtime UPDATE on the row so
  // the new synthesis lands without polling. The function never blocks on
  // Claude — it returns immediately and the actual work happens via
  // EdgeRuntime.waitUntil.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const cached = await getCachedSpokeSummary(threadId).catch((e) => {
        if (alive) setError(`cache read: ${e.message ?? String(e)}`);
        return null;
      });
      if (!alive) return;
      setSummary(cached);
      const isStale = !cached || Date.now() - cached.updatedAt > STALE_MS;
      if (isStale) {
        setSyncing(true);
        const result = await refreshSpokeSummary(threadId);
        if (!alive) return;
        if (result.ok) {
          // The function returns the cached version + a `syncing` flag.
          // We'll get the fresh version via realtime when Claude finishes.
          if (result.summary) setSummary(result.summary);
          if (!result.syncing) setSyncing(false);
        } else {
          setError(result.error);
          setSyncing(false);
        }
      }
    })();
    const unsub = subscribeToSpokeSummary(threadId, (fresh) => {
      if (!alive) return;
      setSummary(fresh);
      setSyncing(false);
      setError(null);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [threadId]);

  const onRefresh = async () => {
    setSyncing(true);
    setError(null);
    const result = await refreshSpokeSummary(threadId);
    if (result.ok) {
      if (result.summary) setSummary(result.summary);
      // Stay in "syncing" state; realtime will flip it off when fresh
      // synthesis lands. If for some reason it never does, auto-clear in 30s.
      setTimeout(() => setSyncing(false), 30_000);
    } else {
      setError(result.error);
      setSyncing(false);
    }
  };

  // Diagnostic — bypasses Claude. If this works but Refresh doesn't, the
  // problem is Claude latency / timeout. If this ALSO fails, the problem
  // is upstream (auth, network, function deploy).
  const onPing = async () => {
    setSyncing(true);
    setError(null);
    const result = await refreshSpokeSummary(threadId, { debug: "ping" });
    if (result.ok) {
      if (result.summary) setSummary(result.summary);
    } else {
      setError(`PING failed: ${result.error}`);
    }
    setSyncing(false);
  };

  // Always-rendered header — so the user can tell the pane is alive even
  // before Otis returns. Shows the topic title + current state + Refresh.
  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <div className="flex flex-col">
        <span className="smallcaps text-[10.5px] text-otis">
          where we are
        </span>
        <span className="text-[15px] font-semibold text-ink tracking-tight">
          {title}
        </span>
      </div>
      <span className="text-[10.5px] text-muted shrink-0">
        {syncing
          ? "syncing…"
          : summary
            ? `updated ${fmtAgo(summary.updatedAt)}`
            : "no synthesis yet"}
      </span>
    </div>
  );

  const refreshButton = (
    <button
      onClick={onRefresh}
      disabled={syncing}
      className="h-9 px-4 rounded-xl border border-rule text-[12.5px] text-ink hover:bg-card/60 transition-colors disabled:opacity-50"
    >
      {syncing ? "Working…" : summary ? "Refresh" : "Have Otis read it now"}
    </button>
  );

  return (
    <div className="px-5 pt-5 pb-12 flex flex-col gap-6">
      {header}

      {error && (
        <div className="rounded-xl border border-attention/40 bg-attention-tint/30 px-3 py-2 text-[12px] text-attention leading-snug">
          <div className="font-semibold mb-1">Otis hit a problem.</div>
          <div className="font-mono text-[11px] break-words">{error}</div>
        </div>
      )}

      {summary && (
        <>
          <div className="text-[14px] text-ink leading-relaxed">
            {summary.summary}
          </div>
          {summary.sections.map((sec, i) => (
            <div key={`${sec.label}-${i}`}>
              <div className="smallcaps text-[10.5px] text-muted mb-2">
                {sec.label}
              </div>
              <ul className="flex flex-col gap-1.5">
                {sec.items.map((item, j) => (
                  <li
                    key={`${item.text}-${j}`}
                    className="flex items-baseline gap-2.5 text-[13.5px] leading-snug text-ink"
                  >
                    <span
                      aria-hidden
                      className={`shrink-0 w-4 text-[12px] font-semibold ${STATUS_COLOR[item.status]}`}
                    >
                      {STATUS_GLYPH[item.status]}
                    </span>
                    <span className="flex-1 min-w-0">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {!summary && !syncing && !error && (
        <div className="text-[12.5px] text-muted leading-relaxed">
          Send a couple of messages back and forth in this thread, then tap
          below to have Otis synthesize where things stand.
        </div>
      )}

      {!summary && syncing && (
        <div className="text-[12.5px] text-muted leading-relaxed">
          Otis is reading the conversation…
        </div>
      )}

      {/* Conversation with Otis — shared between both partners, lives in the
          same thread but tagged context='otis_chat' so it doesn't bleed
          into the main chat. */}
      <div className="border-t border-rule pt-5 mt-2 flex flex-col gap-4">
        <div className="smallcaps text-[10.5px] text-otis">talk to otis</div>

        {otisChatMessages.length === 0 ? (
          <div className="text-[12.5px] text-muted italic leading-relaxed">
            Ask Otis anything about {title} — he can summarize, suggest
            options, or push you toward a decision. Jenny sees this
            conversation too.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {otisChatMessages.map((m) => {
              if (m.author.kind === "agent") {
                return (
                  <Voice
                    key={m.id}
                    voice="otis"
                    name="Otis"
                    role="facilitator"
                    body={m.body}
                    timestamp={formatClock(m.createdAt)}
                  />
                );
              }
              const speaker =
                m.author.userId === currentUserId
                  ? "You"
                  : usersById.get(m.author.userId)?.name?.split(" ")[0] ??
                    "Partner";
              return (
                <div key={m.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-ink">
                      {speaker}
                    </span>
                    <span className="text-[11px] text-muted">
                      {formatClock(m.createdAt)}
                    </span>
                  </div>
                  <div className="text-[14.5px] text-ink leading-snug">
                    {m.body}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      <div className="pt-2 flex items-center gap-2">
        {refreshButton}
        <button
          onClick={onPing}
          disabled={syncing}
          className="h-9 px-3 rounded-xl border border-rule text-[11.5px] text-muted hover:bg-card/60 transition-colors disabled:opacity-50"
        >
          Ping
        </button>
      </div>
    </div>
  );
};

// (OtisChatComposer removed — replaced by the main bottom Composer which
// switches its placeholder and send-handler based on which pane is active.
// Avoids two stacked composers + keyboard handling duplication.)

// ============================================================================
// OpsCardRow — the canonical card render. Used by both OpsQueue (Items pane +
// bottom sheet) and RoutedBurst (inline in chat). Status flow is the same
// everywhere it appears, so we live the logic once.
//
// Left circle shows status: empty (pending), initial-tinted (accepted),
// check (done). Right primary action: Accept → Done → Undo. Refile pill
// always present so anyone can flip ownership at any stage.
// ============================================================================

type OpsCardRowProps = {
  card: OpsCard;
  currentUserId: string;
  partnerId: string;
  usersById: Map<string, User>;
  threadId: string;
  // Slightly smaller styling for the inline-in-chat use case.
  compact?: boolean;
};

const OpsCardRow = ({
  card,
  currentUserId,
  partnerId,
  usersById,
  threadId,
  compact = false,
}: OpsCardRowProps) => {
  const owner = usersById.get(card.owner);
  const ownerInitials = owner?.initials ?? "·";
  const isYours = card.owner === currentUserId;
  const status = card.status;
  const done = status === "done";
  const accepted = status === "accepted";
  const conflict = card.conflictWith;

  const onAccept = () => {
    void setOpsCardStatus(threadId, card.id, "accepted");
  };
  const onMarkDone = () => {
    void setOpsCardStatus(threadId, card.id, "done");
  };
  const onUndo = () => {
    void setOpsCardStatus(threadId, card.id, "accepted");
  };
  const onRefile = () => {
    const next = isYours ? partnerId : currentUserId;
    if (!next) return;
    void setOpsCardOwner(threadId, card.id, next);
  };

  const titleSize = compact ? "text-[13.5px]" : "text-[14px]";
  const paddingY = compact ? "py-2" : "py-2.5";

  return (
    <li className={`${paddingY} ${done ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div
          aria-label={
            done ? "Done" : accepted ? "Accepted" : "Pending"
          }
          className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[9.5px] font-bold uppercase tracking-wider transition-colors ${
            done
              ? "bg-otis-tint text-otis"
              : accepted
                ? "bg-otis-tint/60 text-otis ring-1 ring-otis/30"
                : "border border-rule text-muted"
          }`}
        >
          {done ? (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="5 12 10 17 19 8" />
            </svg>
          ) : accepted ? (
            ownerInitials
          ) : null}
        </div>

        {/* Title + when/subtitle */}
        <div className="flex-1 min-w-0">
          <div
            className={`${titleSize} leading-snug flex items-center gap-1.5 ${
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
            <div className="text-[11px] text-muted mt-0.5">
              {card.when}
              {card.when && card.subtitle && " · "}
              {card.subtitle}
            </div>
          )}
        </div>

        {/* Right actions: primary action(s) + refile pill.
            Accepted state shows Done (primary, green) + Pass (ghost) — the
            "oops I actually can't do this" escape hatch lives next to the
            commitment, so both moves are equally legible. */}
        <div className="shrink-0 flex items-center gap-1.5">
          {isYours && status === "pending" && (
            <button
              onClick={onAccept}
              className="h-7 px-2.5 rounded-md bg-ink text-paper text-[11px] font-semibold tracking-tight hover:opacity-90 transition-opacity"
            >
              Accept
            </button>
          )}
          {isYours && status === "accepted" && (
            <>
              <button
                onClick={onMarkDone}
                className="h-7 px-2.5 rounded-md bg-otis text-paper text-[11px] font-semibold tracking-tight hover:opacity-90 transition-opacity"
              >
                Done
              </button>
              <button
                onClick={onRefile}
                className="h-7 px-2 rounded-md border border-rule text-muted text-[11px] font-semibold tracking-tight hover:text-ink hover:border-ink transition-colors"
                title="Send back to partner"
              >
                Pass
              </button>
            </>
          )}
          {isYours && status === "done" && (
            <button
              onClick={onUndo}
              className="text-[10.5px] text-muted hover:text-ink underline transition-colors"
            >
              Reopen
            </button>
          )}
          {/* Refile pill is the always-available ownership toggle. Shown for
              non-yours cards so the partner can take ownership, and as a
              quiet secondary on yours-pending / yours-done. */}
          {!(isYours && status === "accepted") && (
            <button
              onClick={onRefile}
              aria-label={isYours ? "Send to partner" : "Take it"}
              title={isYours ? "Send to partner" : "Take it"}
              className={`h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[9.5px] font-semibold uppercase tracking-wider transition-colors ${
                isYours
                  ? "bg-card text-muted hover:text-ink"
                  : "bg-attention-tint text-attention hover:opacity-90"
              }`}
            >
              <span>{ownerInitials}</span>
              <span aria-hidden className="opacity-50">↻</span>
            </button>
          )}
        </div>
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
    </li>
  );
};

// ============================================================================
// OpsQueue — the triage surface inside the partnership Sheet and Items pane.
// Groups cards by bucket; rows handle their own status flow.
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
              {group.map((card) => (
                <OpsCardRow
                  key={card.id}
                  card={card}
                  currentUserId={currentUserId}
                  partnerId={partnerId}
                  usersById={usersById}
                  threadId={threadId}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// (RoutedBurst — removed. The inline card-stack render of a partner's burst
// inside chat made the chat feel like a status feed instead of a conversation.
// State now lives entirely in the Items pane; the chat message gets a small
// tapback-style "✓ Otis tracked N items" pill that links to the pane.)
// ============================================================================

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
