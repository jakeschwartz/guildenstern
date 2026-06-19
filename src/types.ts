// v0 dogfood scope: partnership + personal threads only.
// The other thread kinds (group, relationship, arbitration) lived here in the
// earlier prototype — they're in git history and will come back later.

export type UserId = string;
export type ThreadId = string;
export type MessageId = string;
export type PartnershipId = string;

export type User = {
  id: UserId;
  name: string;
  initials: string;
};

export type MessageAuthor =
  | { kind: "human"; userId: UserId }
  | { kind: "agent" };

export type BriefingTone = "attention" | "mira" | "muted" | "neutral";

export type BriefingItem = {
  label: string;
  detail?: string;
  status?: string;
  tone?: BriefingTone;
  threadId?: ThreadId;
};

// Calendar conflict between a newly-tracked item and an existing event on one
// of the partners' calendars. Discovered by Otis at burst time when Google
// Calendar access is connected. Attached both to the ops_card (so it persists
// in the Sheet queue) and to the Otis message that flagged it (so the chat
// reads loudly inline).
export type Conflict = {
  // The owner of the calendar this conflict was found on. Almost always the
  // owner of the new card.
  calendarOwnerId: UserId;
  // The existing event we collided with.
  eventTitle: string;
  eventStart: number; // ms epoch
  eventEnd: number; // ms epoch
  // Human-readable rendition of the new item's proposed time.
  proposedWhen: string;
};

// Where in the thread this message belongs. 'main' = the partners' chat
// (and Mira's personal thread). 'otis_chat' = the talk-to-Otis conversation
// behind the synthesis pane in a spoke. Same thread, different surfaces.
export type MessageContext = "main" | "otis_chat";

// A photo attached to a message. v1 only supports images. Path is the
// Storage object path inside the message-attachments bucket; the client
// resolves a public URL from it. Width/height let us reserve aspect-correct
// space in the bubble before the image actually loads.
export type Attachment = {
  kind: "image";
  path: string;
  width: number;
  height: number;
};

// A shared thread an agent proposes, rendered as an actionable callout under
// its message. Suggest-then-confirm: nothing is created until the user taps
// accept (the agent never silently spins up a thread). Always a partnership
// (shared) thread. Two producers:
//   - Otis (partnership thread): a message reads as wildly off-topic, so he
//     offers to move it into its own thread. sourceMessageIds is non-empty;
//     on accept those messages move into the new thread.
//   - Mira (personal thread): the user asks her to set up a shared room, so
//     she offers to create one with the partner. sourceMessageIds is empty
//     (nothing to move — fresh thread).
// The card's tint follows the thread it renders in (Mira plum / Otis green),
// so voice isn't stored here.
export type ThreadSuggestion = {
  // The agent's best guess at the topic, used as the new thread's title.
  suggestedTitle: string;
  // One-line reason ("This reads like its own project, not part of the
  // day-to-day here." / "I'll spin up a shared thread for it.").
  reason: string;
  // The message(s) that triggered the suggestion — moved into the new thread
  // on accept so the conversation literally continues there. Empty when the
  // agent is creating a fresh thread on request (Mira).
  sourceMessageIds: MessageId[];
  // Lifecycle. "open" shows the accept/dismiss buttons; "accepted" collapses
  // to a tappable link into the new thread; "dismissed" hides the affordance.
  status: "open" | "accepted" | "dismissed";
  // Set once accepted, so the collapsed link knows where to navigate.
  createdThreadId?: ThreadId;
};

export type Message = {
  id: MessageId;
  author: MessageAuthor;
  body: string;
  createdAt: number;
  context?: MessageContext;
  attachments?: Attachment[];
  // "Agent read receipt": when Otis finished processing this message
  // (partnership main chat only). Renders as a small green dot on the
  // sender's message — the fourth delivery state after sent/delivered/read.
  agentProcessedAt?: number;
  // The message this one is a reply to (quoted above the bubble).
  replyToMessageId?: MessageId;
  briefing?: {
    title: string;
    items: BriefingItem[];
  };
  // Conflicts Otis discovered when echoing a burst. Each callout pairs the
  // newly-tracked item's title with the existing event it collided with, so
  // the chat can render the conflict inline below the structured echo.
  conflictCallouts?: Array<{ itemTitle: string; conflict: Conflict }>;
  // Off-topic → new-thread proposal attached to an Otis message.
  threadSuggestion?: ThreadSuggestion;
  foldGroupId?: string;
  foldSummary?: string;
};

// pending = just landed from a burst, nobody's claimed it yet.
// accepted = the owner explicitly committed ("Jake's got it"). Otis announces
//   in chat so the sender knows it's claimed without checking the queue.
// done    = completed.
// deferred = punted to later (unused in v1).
export type OpsCardStatus = "pending" | "accepted" | "done" | "deferred";
export type OpsBucket = "today" | "week" | "ongoing" | "long";

export type OpsCard = {
  id: string;
  title: string;
  subtitle?: string;
  owner: UserId;
  when: string;
  bucket: OpsBucket;
  status: OpsCardStatus;
  sourceMessageId: MessageId;
  sourceUserId: UserId;
  createdAt: number;
  // Optional: existing calendar event this card's proposed time conflicts
  // with. Surfaced as a ⚠ indicator in the Sheet row with a tap-to-expand
  // resolution menu.
  conflictWith?: Conflict;
  // Set when someone taps "?" on a card that doesn't make sense to them. Otis
  // relays a clarifying question into the thread (so the partner sees the ask),
  // and the card shows a "waiting on clarification" chip until it's resolved.
  clarification?: {
    // What the asker said was unclear. Empty string for a one-tap ask.
    note: string;
    // Who flagged it (so the chip can name the other partner as the answerer).
    askedByUserId: UserId;
    askedAt: number;
    status: "open" | "resolved";
  };
};

export type Partnership = {
  id: PartnershipId;
  participantIds: [UserId, UserId];
};

// Normalized Google Calendar event. Returned by the fetch-google-events
// edge function which collapses Google's dateTime/date variation into a
// single ms epoch + allDay flag, so the client doesn't have to.
export type CalendarEvent = {
  id: string;
  title: string;
  start: number; // ms epoch
  end: number; // ms epoch
  allDay: boolean;
  location: string | null;
};

// "Where we are" synthesis for a spoke. Otis writes one per non-default
// partnership thread; cached in spoke_summaries and refreshed on demand.
export type SpokeSectionItemStatus =
  | "done"
  | "open"
  | "maybe"
  | "action"
  | "flagged";

export type SpokeSectionItem = {
  text: string;
  status: SpokeSectionItemStatus;
};

export type SpokeSection = {
  label: string;
  items: SpokeSectionItem[];
};

export type SpokeSummary = {
  threadId: ThreadId;
  summary: string;
  sections: SpokeSection[];
  updatedAt: number; // ms epoch
};

// Tapback. One per user per message; a different emoji replaces, the same
// emoji removes.
export type Reaction = {
  messageId: MessageId;
  userId: UserId;
  emoji: string;
};

export type PartnershipThread = {
  kind: "partnership";
  id: ThreadId;
  partnershipId: PartnershipId;
  title: string;
  isDefault: boolean;
  messages: Message[];
  opsCards: OpsCard[];
  reactions?: Reaction[];
  agentActive: boolean;
  createdAt: number;
};

export type PersonalThread = {
  kind: "personal";
  id: ThreadId;
  ownerId: UserId;
  messages: Message[];
  agentActive: boolean;
  createdAt: number;
};

export type Thread = PartnershipThread | PersonalThread;
