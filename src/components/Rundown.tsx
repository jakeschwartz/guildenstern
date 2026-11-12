// Mira's rundown: her pinned inbox row, opened up into what's going on for
// you. It's the payoff for opening the app (and for tapping a rundown push):
// what needs you, your day, what's new from your partner, and what got handled.
// Mornings lead with what needs you; evenings lead with wins and end by asking
// for tomorrow. With nothing to say it shrinks to one line.

import { useEffect } from "react";
import { Avatar } from "./Avatar";
import {
  addCalendarPrep,
  addEmailItem,
  dismissCalendarNote,
  dismissEmailItem,
  refreshCalendarEvents,
  setOpsCardStatus,
  useStore,
} from "../state/store";
import type { CalendarNote, EmailItem, OpsCard, PersonalThread } from "../types";
import { formatRelative } from "../lib/time";
import { formatDue, isOverdue } from "../lib/due";

type Props = {
  miraThread: PersonalThread;
  onOpen: (threadId: string) => void;
};

type Item = { card: OpsCard; threadId: string; where: string | null };

const HOUR = 60 * 60 * 1000;
const MAX_ROWS = 3;
const CALENDAR_STALE_MS = 15 * 60 * 1000;

// #preview-rundown-am / -pm pin the clock to show morning or evening.
let previewClock: number | null = null;
export const setRundownPreviewClock = (ms: number | null) => {
  previewClock = ms;
};

const isOpenCard = (c: OpsCard) => c.status === "pending" || c.status === "accepted";

const clock = (ms: number) =>
  new Date(ms)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "")
    .replace(/:00$/, "");

const lastActivity = (t: PersonalThread) =>
  t.messages[t.messages.length - 1]?.createdAt ?? t.createdAt;

export const Rundown = ({ miraThread, onOpen }: Props) => {
  const threads = useStore((s) => s.threads);
  const users = useStore((s) => s.users);
  const partnerships = useStore((s) => s.partnerships);
  const me = useStore((s) => s.currentUserId);
  const events = useStore((s) => s.calendarEvents);
  const eventsFetchedAt = useStore((s) => s.calendarEventsFetchedAt);
  const emailItems = useStore((s) => s.emailItems);
  const calendarNotes = useStore((s) => s.calendarNotes);

  useEffect(() => {
    if (!eventsFetchedAt || Date.now() - eventsFetchedAt > CALENDAR_STALE_MS) {
      void refreshCalendarEvents();
    }
  }, [eventsFetchedAt]);

  const firstName = (id: string | null) =>
    (users.find((u) => u.id === id)?.name ?? "").split(" ")[0] || null;
  const p = partnerships[0];
  const partnerId = p ? (p.participantIds[0] === me ? p.participantIds[1] : p.participantIds[0]) : null;
  const partner = partnerId && partnerId !== me ? firstName(partnerId) : null;
  const myFirst = firstName(me);

  const now = previewClock ?? Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const endOfToday = startOfToday + 24 * HOUR;
  const hour = new Date(now).getHours();
  const part: "morning" | "day" | "evening" = hour < 12 ? "morning" : hour < 17 ? "day" : "evening";

  const items: Item[] = threads.flatMap((t) =>
    t.kind === "partnership"
      ? t.opsCards.map((card) => ({ card, threadId: t.id, where: t.isDefault ? null : t.title }))
      : [],
  );
  const byCreated = (a: Item, b: Item) => a.card.createdAt - b.card.createdAt;
  // Dated items first, soonest first (overdue on top); undated by filing order.
  const byDue = (a: Item, b: Item) => {
    const ad = a.card.dueAt, bd = b.card.dueAt;
    if (ad !== undefined && bd !== undefined) return ad - bd;
    if (ad !== undefined) return -1;
    if (bd !== undefined) return 1;
    return byCreated(a, b);
  };

  const questions = items
    .filter(({ card }) => card.clarification?.status === "open" && card.clarification.askedByUserId !== me)
    .sort(byCreated);
  const fresh = items
    .filter(({ card }) =>
      card.owner === me && isOpenCard(card) && partner !== null &&
      card.sourceUserId === partnerId && card.createdAt > now - 24 * HOUR
    )
    .sort(byCreated);
  const freshIds = new Set(fresh.map((i) => i.card.id));
  const list = items
    .filter(({ card }) => card.owner === me && isOpenCard(card) && !freshIds.has(card.id))
    .sort(byDue);
  const handledSince = part === "morning" ? now - 24 * HOUR : startOfToday;
  const handled = items
    .filter(({ card }) =>
      card.sourceUserId === me && card.owner !== me && card.status === "done" &&
      (card.doneAt ?? 0) > handledSince
    )
    .sort((a, b) => (a.card.doneAt ?? 0) - (b.card.doneAt ?? 0));
  const inHand = items.filter(({ card }) =>
    card.sourceUserId === me && card.owner === partnerId && isOpenCard(card)
  ).length;
  const today = part === "evening"
    ? []
    : events
      .filter((e) => !e.allDay && e.start > now && e.start < endOfToday)
      .sort((a, b) => a.start - b.start);

  // Mira's look at the next few days: heads-ups first, then prep.
  const comingUp = calendarNotes.filter((n) => n.eventStart === null || n.eventStart > now - 6 * HOUR);

  const quiet =
    !questions.length && !list.length && !fresh.length && !handled.length &&
    !today.length && !emailItems.length && !comingUp.length;

  let greeting: string;
  if (part === "morning") greeting = myFirst ? `Morning, ${myFirst}. Here's your day.` : "Morning. Here's your day.";
  else if (part === "day") greeting = "Here's where things are.";
  else if (handled.length && partner) {
    greeting = `${partner} handled ${handled.length === 1 ? "one" : handled.length} of your things today.`;
  } else greeting = "Evening. Here's where things are.";

  // ---------- sections ----------

  const needsYou = (questions.length > 0 || list.length > 0) && (
    <Section key="needs" label="Needs you" attention>
      {questions.slice(0, 2).map(({ card, threadId }) => (
        <button
          key={card.id}
          onClick={() => onOpen(threadId)}
          className="w-full text-left bg-paper border border-rule rounded-squircle px-3 py-2.5 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="smallcaps text-[10.5px] text-muted">
              {firstName(card.clarification!.askedByUserId) ?? "Your partner"} asked · {card.title}
            </div>
            <div className="text-[14.5px] text-ink leading-snug mt-0.5">
              {card.clarification!.note.trim() || "Could you clarify what's needed here?"}
            </div>
          </div>
          <span className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-attention-tint text-attention shrink-0">
            Answer
          </span>
        </button>
      ))}
      <CardRows rows={list} onOpen={onOpen} checkable />
    </Section>
  );

  const todaySection = today.length > 0 && (
    <Section key="today" label="Today">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14.5px]">
        {today.slice(0, 4).map((e) => (
          <div key={e.id} className="contents">
            <span className="text-[13px] text-muted tabular-nums pt-px">{clock(e.start)}</span>
            <span className="text-ink truncate">{e.title}</span>
          </div>
        ))}
      </div>
    </Section>
  );

  const freshSection = fresh.length > 0 && partner && (
    <Section key="fresh" label={`New from ${partner}`} attention>
      <CardRows rows={fresh} onOpen={onOpen} checkable tag="new" />
    </Section>
  );

  const handledSection = handled.length > 0 && (
    <Section key="handled" label={part === "morning" ? "Handled since yesterday" : "Handled today"}>
      {handled.slice(-MAX_ROWS).map(({ card, threadId }) => (
        <button
          key={card.id}
          onClick={() => onOpen(threadId)}
          className="w-full text-left flex items-center gap-2.5 text-[14.5px] leading-snug"
        >
          <span className="w-4 text-center text-[13px] text-muted shrink-0">✓</span>
          <span className="flex-1 min-w-0 truncate text-muted">
            <span className="text-ink">{card.title}</span>
            {firstName(card.owner) && ` · ${firstName(card.owner)}`}
          </span>
        </button>
      ))}
      {handled.length > MAX_ROWS && (
        <div className="text-[12.5px] text-muted pl-6">+{handled.length - MAX_ROWS} more</div>
      )}
    </Section>
  );

  // Mira's finds from your inbox. Private until you add one, for you or for
  // your partner (which pushes them, like any item landing on their list).
  const emailSection = emailItems.length > 0 && (
    <Section key="email" label="From your email">
      {emailItems.slice(0, MAX_ROWS).map((item) => (
        <EmailRow
          key={item.id}
          item={item}
          meId={me}
          partnerId={partner ? partnerId : null}
          partnerName={partner}
        />
      ))}
      {emailItems.length > MAX_ROWS && (
        <div className="text-[12.5px] text-muted pl-1">+{emailItems.length - MAX_ROWS} more</div>
      )}
    </Section>
  );

  const comingUpSection = comingUp.length > 0 && (
    <Section key="coming" label="Coming up">
      {comingUp.filter((n) => n.kind === "heads_up").slice(0, MAX_ROWS).map((n) => (
        <HeadsUpRow key={n.id} note={n} now={now} />
      ))}
      {comingUp.filter((n) => n.kind === "prep").slice(0, MAX_ROWS).map((n) => (
        <PrepRow
          key={n.id}
          note={n}
          meId={me}
          partnerId={partner ? partnerId : null}
          partnerName={partner}
        />
      ))}
    </Section>
  );

  const tomorrow = part === "evening" && partner && (
    <div key="tomorrow" className="flex flex-col gap-1.5">
      <SectionLabel label="Anything for tomorrow?" />
      <button
        onClick={() => onOpen(miraThread.id)}
        className="w-full flex items-center gap-2 bg-paper border border-rule rounded-full pl-3.5 pr-1.5 py-1.5 text-[14.5px] text-muted text-left"
      >
        Tell Mira
        <span className="ml-auto h-7 w-7 rounded-full bg-card flex items-center justify-center text-[13px]">↑</span>
      </button>
      <div className="text-[12.5px] text-muted">Mira files it and puts it in front of {partner}.</div>
    </div>
  );

  const sections = part === "evening"
    ? [handledSection, freshSection, needsYou, comingUpSection, emailSection, tomorrow]
    : [needsYou, comingUpSection, emailSection, todaySection, freshSection, handledSection];

  return (
    <div className="bg-mira-tint border-b border-rule px-4 py-3 flex items-start gap-3">
      <button onClick={() => onOpen(miraThread.id)} className="shrink-0" aria-label="Open Mira">
        <Avatar initials="M" size="md" voice="mira" />
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <button onClick={() => onOpen(miraThread.id)} className="flex items-baseline gap-2 text-left">
          <span className="h-1.5 w-1.5 rounded-full bg-mira shrink-0 self-center" />
          <span className="text-[17px] font-semibold tracking-tight text-ink">Mira</span>
          <span className="smallcaps text-[10.5px] text-mira ml-1">pinned</span>
          <span className="ml-auto text-[13px] text-muted">{formatRelative(lastActivity(miraThread))}</span>
        </button>
        {quiet ? (
          <div className="text-[14.5px] text-muted leading-snug">
            {partner && inHand > 0
              ? `All clear. ${partner} has ${inHand === 1 ? "one thing" : `${inHand} things`} in hand, and nothing needs you.`
              : "All clear. Nothing needs you."}
          </div>
        ) : (
          <div className="border-l-2 border-mira pl-3 flex flex-col gap-3.5">
            <div className="text-[15px] text-ink leading-snug">{greeting}</div>
            {sections}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- pieces ----------

const SectionLabel = ({ label, attention = false }: { label: string; attention?: boolean }) => (
  <div className="flex items-center gap-1.5">
    {attention && <span className="h-1.5 w-1.5 rounded-full bg-attention shrink-0" />}
    <span className="smallcaps text-[10.5px] text-muted">{label}</span>
  </div>
);

const Section = ({
  label,
  attention = false,
  children,
}: {
  label: string;
  attention?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <SectionLabel label={label} attention={attention} />
    {children}
  </div>
);

// Cards on your list. The circle marks it done right here; the title opens
// its thread.
const CardRows = ({
  rows,
  onOpen,
  checkable = false,
  tag,
}: {
  rows: Item[];
  onOpen: (threadId: string) => void;
  checkable?: boolean;
  tag?: string;
}) => (
  <>
    {rows.slice(0, MAX_ROWS).map(({ card, threadId, where }) => (
      <div key={card.id} className="flex items-center gap-2.5 text-[14.5px] leading-snug">
        {checkable && (
          <button
            onClick={() => void setOpsCardStatus(threadId, card.id, "done")}
            className="h-4 w-4 rounded-full border-[1.5px] border-muted shrink-0"
            aria-label={`Mark "${card.title}" done`}
          />
        )}
        <button onClick={() => onOpen(threadId)} className="flex-1 min-w-0 flex items-baseline gap-2 text-left">
          <span className="flex-1 min-w-0 truncate text-ink">{card.title}</span>
          {tag && <span className="smallcaps text-[10.5px] text-attention shrink-0">{tag}</span>}
          {!tag && card.dueAt !== undefined && (
            <span
              className={`text-[12.5px] shrink-0 ${isOverdue(card) ? "text-attention font-semibold" : "text-muted"}`}
            >
              {formatDue(card)}
            </span>
          )}
          {!tag && card.dueAt === undefined && where && (
            <span className="text-[12.5px] text-muted shrink-0">{where}</span>
          )}
        </button>
      </div>
    ))}
    {rows.length > MAX_ROWS && (
      <div className="text-[12.5px] text-muted pl-6">+{rows.length - MAX_ROWS} more</div>
    )}
  </>
);

// One suggestion from your inbox: what it is, when, and who it came from,
// with "Mine" / "<Partner>'s" to put it on the shared list, or × to drop it.
const EmailRow = ({
  item,
  meId,
  partnerId,
  partnerName,
}: {
  item: EmailItem;
  meId: string;
  partnerId: string | null;
  partnerName: string | null;
}) => {
  const due =
    item.dueAt !== undefined
      ? formatDue({ dueAt: item.dueAt, dueHasTime: item.dueHasTime, when: "" } as OpsCard)
      : null;
  const source = [item.fromName, item.subtitle].filter(Boolean).join(" · ");
  const pill =
    "text-[12.5px] font-semibold px-3 py-1 rounded-full transition-opacity hover:opacity-90";
  return (
    <div className="bg-paper border border-rule rounded-squircle px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 text-[14.5px] text-ink leading-snug">{item.title}</span>
        {due && <span className="text-[12.5px] text-muted shrink-0">{due}</span>}
      </div>
      {source && <div className="text-[12.5px] text-muted truncate -mt-1">{source}</div>}
      <div className="flex items-center gap-1.5">
        <button onClick={() => void addEmailItem(item.id, meId)} className={`${pill} bg-ink text-paper`}>
          {partnerId ? "Mine" : "Add to my list"}
        </button>
        {partnerId && partnerName && (
          <button
            onClick={() => void addEmailItem(item.id, partnerId)}
            className={`${pill} bg-card text-ink`}
          >
            {partnerName}'s
          </button>
        )}
        <button
          onClick={() => void dismissEmailItem(item.id)}
          aria-label="Not a to-do"
          className="ml-auto h-7 w-7 rounded-full text-muted hover:text-ink text-[15px] leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
};

// Mira's **key words** in bold ink, the rest quieter, so a glance catches
// what matters.
const Marked = ({ text }: { text: string }) => {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return <span className="text-ink">{text}</span>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-ink">{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

// "Thu", "Tomorrow", "Today" for an event's day, relative to now.
const dayLabel = (ms: number | null, now: number) => {
  if (ms === null) return null;
  const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(ms) - startOf(now)) / (24 * HOUR));
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Date(ms).toLocaleDateString([], { weekday: "short" });
};

// Something worth knowing in the next few days. × = got it.
const HeadsUpRow = ({ note, now }: { note: CalendarNote; now: number }) => (
  <div className="flex items-start gap-2.5 text-[14.5px] leading-snug">
    <span className="text-[12.5px] text-muted shrink-0 w-[4.5rem] pt-px">{dayLabel(note.eventStart, now)}</span>
    <span className="flex-1 min-w-0 text-muted">
      <Marked text={note.noteMarked ?? note.note} />
    </span>
    <button
      onClick={() => void dismissCalendarNote(note.id)}
      aria-label="Got it"
      className="h-6 w-6 -mt-0.5 rounded-full text-muted hover:text-ink text-[15px] leading-none shrink-0"
    >
      ×
    </button>
  </div>
);

// Prep an event needs first, with Mine / <Partner>'s to put it on the list.
const PrepRow = ({
  note,
  meId,
  partnerId,
  partnerName,
}: {
  note: CalendarNote;
  meId: string;
  partnerId: string | null;
  partnerName: string | null;
}) => {
  const due =
    note.dueAt !== undefined
      ? formatDue({ dueAt: note.dueAt, dueHasTime: note.dueHasTime, when: "" } as OpsCard)
      : null;
  const pill = "text-[12.5px] font-semibold px-3 py-1 rounded-full transition-opacity hover:opacity-90";
  return (
    <div className="bg-paper border border-rule rounded-squircle px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 text-[14.5px] text-ink leading-snug">{note.prepTitle ?? note.note}</span>
        {due && <span className="text-[12.5px] text-muted shrink-0">{due}</span>}
      </div>
      {note.eventTitle && (
        <div className="text-[12.5px] text-muted truncate -mt-1">For {note.eventTitle}</div>
      )}
      <div className="flex items-center gap-1.5">
        <button onClick={() => void addCalendarPrep(note.id, meId)} className={`${pill} bg-ink text-paper`}>
          {partnerId ? "Mine" : "Add to my list"}
        </button>
        {partnerId && partnerName && (
          <button onClick={() => void addCalendarPrep(note.id, partnerId)} className={`${pill} bg-card text-ink`}>
            {partnerName}'s
          </button>
        )}
        <button
          onClick={() => void dismissCalendarNote(note.id)}
          aria-label="Not needed"
          className="ml-auto h-7 w-7 rounded-full text-muted hover:text-ink text-[15px] leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
};
