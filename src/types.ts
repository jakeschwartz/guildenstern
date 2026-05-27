export type UserId = string;
export type ThreadId = string;
export type MessageId = string;
export type IntentId = string;

export type User = {
  id: UserId;
  name: string;
  initials: string;
};

export type MessageAuthor =
  | { kind: "human"; userId: UserId }
  | { kind: "agent" }
  | { kind: "external"; name: string; via: "email" | "sms" };

export type ReactionKind = "agreed" | "not-quite" | "sitting-with";

export type Reaction = {
  userId: UserId;
  kind: ReactionKind;
  at: number;
};

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
  // Special non-thread row, e.g. "4 new contacts to review"
  action?: "review-new";
};

export type Message = {
  id: MessageId;
  author: MessageAuthor;
  body: string;
  createdAt: number;
  reactions?: Reaction[];
  // For outbound channel: true while awaiting user's send.
  draft?: boolean;
  // For structured agent summaries (e.g. morning briefing).
  // When present, BriefingCard renders before the optional trailing body.
  briefing?: {
    title: string;
    items: BriefingItem[];
  };
};

export type Spoke = {
  memberId: UserId;
  messages: Message[];
  awaitingMember: boolean;
};

export type GroupThread = {
  kind: "group";
  id: ThreadId;
  title: string;
  hostId: UserId;
  memberIds: UserId[];
  messages: Message[];
  spokes: Record<UserId, Spoke>;
  agentActive: boolean;
  createdAt: number;
};

export type IntentStatus =
  | "ratified"
  | "awaiting-them"
  | "awaiting-you"
  | "expired";

export type MutualIntent = {
  id: IntentId;
  body: string;
  proposedAt: number;
  status: IntentStatus;
  ratifiedAt?: number;
};

export type RelationshipCard = {
  name: string;
  role: string;
  company: string;
  metWhere: string;
  metWhen: number;
};

export type RelationshipThread = {
  kind: "relationship";
  id: ThreadId;
  hostId: UserId;
  contact: RelationshipCard;
  intents: MutualIntent[];
  privateWithAgent: Message[];
  outbound: Message[];
  agentActive: boolean;
  createdAt: number;
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

export type PartnershipId = string;

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

export type ArbitrationPosition = {
  party: UserId;
  body: string;
};

export type ArbitrationOption = {
  id: string;
  label: string;
  detail?: string;
  proposedBy: UserId | "agent";
};

export type ArbitrationDecision = {
  optionId: string;
  ratifiedAt: number;
};

export type VentSpoke = {
  userId: UserId;
  messages: Message[];
  positionRatified: boolean;
};

export type ArbitrationThread = {
  kind: "arbitration";
  id: ThreadId;
  partnershipId: PartnershipId;
  question: string;
  positions: ArbitrationPosition[];
  options: ArbitrationOption[];
  decision: ArbitrationDecision | null;
  messages: Message[];
  ventSpokes: Record<UserId, VentSpoke>;
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

export type Thread =
  | GroupThread
  | RelationshipThread
  | PartnershipThread
  | ArbitrationThread
  | PersonalThread;
