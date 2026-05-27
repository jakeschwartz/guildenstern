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

export type BriefingTone =
  | "attention"
  | "agent"
  | "deliberation"
  | "muted"
  | "neutral";

export type BriefingItem = {
  label: string;
  detail?: string;
  status?: string;
  tone?: BriefingTone;
  threadId?: ThreadId;
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
