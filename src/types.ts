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

export type Message = {
  id: MessageId;
  author: MessageAuthor;
  body: string;
  createdAt: number;
  briefing?: {
    title: string;
    items: BriefingItem[];
  };
  // Conflicts Otis discovered when echoing a burst. Each callout pairs the
  // newly-tracked item's title with the existing event it collided with, so
  // the chat can render the conflict inline below the structured echo.
  conflictCallouts?: Array<{ itemTitle: string; conflict: Conflict }>;
  foldGroupId?: string;
  foldSummary?: string;
};

export type OpsCardStatus = "pending" | "done" | "deferred";
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
};

export type Partnership = {
  id: PartnershipId;
  participantIds: [UserId, UserId];
};

export type PartnershipThread = {
  kind: "partnership";
  id: ThreadId;
  partnershipId: PartnershipId;
  title: string;
  isDefault: boolean;
  messages: Message[];
  opsCards: OpsCard[];
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
