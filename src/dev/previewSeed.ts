// Dev-only mock state for #preview-* hash routes. Used so we can iterate on
// the partnership-thread UI (OpsCards Sheet, banner, Otis voice, etc.) without
// auth + Supabase round-trips. Never imported in production code paths — only
// from App.tsx when a hash route is detected, and only on web.

import type {
  Conflict,
  Message,
  OpsCard,
  Partnership,
  PartnershipThread,
  PersonalThread,
  User,
} from "../types";

const ME_ID = "preview-me";
const PARTNER_ID = "preview-partner";
const PARTNERSHIP_ID = "preview-partnership";
export const PREVIEW_PERSONAL_THREAD_ID = "preview-personal-thread";
const PERSONAL_THREAD_ID = PREVIEW_PERSONAL_THREAD_ID;
export const PREVIEW_PARTNERSHIP_THREAD_ID = "preview-partnership-thread";

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;

const me: User = { id: ME_ID, name: "Jake", initials: "JS" };
const partner: User = { id: PARTNER_ID, name: "Jenny", initials: "JZ" };

const partnership: Partnership = {
  id: PARTNERSHIP_ID,
  participantIds: [ME_ID, PARTNER_ID],
};

// Calendar event Otis discovered when processing Jenny's burst: contractor
// Thursday 9am collides with Jake's existing "Engineering review" meeting.
// Computed off NOW so the day-of-week math is stable in preview.
const THURSDAY_9AM = (() => {
  const d = new Date(NOW);
  // Walk forward to the next Thursday (day 4).
  const daysToThursday = (4 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysToThursday);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
})();

const contractorConflict: Conflict = {
  calendarOwnerId: ME_ID,
  eventTitle: "Engineering review",
  eventStart: THURSDAY_9AM,
  eventEnd: THURSDAY_9AM + 60 * MIN,
  proposedWhen: "Thursday 9am",
};

const messages: Message[] = [
  {
    id: "m1",
    author: { kind: "human", userId: PARTNER_ID },
    body: "Eli pickup tomorrow at 3, contractor Thursday 9am, and we're out of diapers",
    createdAt: NOW - 8 * MIN,
  },
  {
    id: "m2",
    author: { kind: "agent" },
    body: "Got it — Eli pickup tomorrow, contractor Thursday 9am, diapers. Sound right?",
    createdAt: NOW - 7 * MIN,
    conflictCallouts: [
      { itemTitle: "Be home for contractor", conflict: contractorConflict },
    ],
  },
  {
    id: "m3",
    author: { kind: "human", userId: PARTNER_ID },
    body: "yep",
    createdAt: NOW - 5 * MIN,
  },
  // Off-topic burst: a whole vacation-planning project dropped into the
  // day-to-day shared thread. Otis catches it and proposes a dedicated thread.
  {
    id: "m4",
    author: { kind: "human", userId: PARTNER_ID },
    body: "Also can we start figuring out the Italy trip — flights into Rome, where we stay, whether we bring the kids or ask my mom, and roughly the budget",
    createdAt: NOW - 3 * MIN,
  },
  {
    id: "m5",
    author: { kind: "agent" },
    body: "That's a bigger planning project than the day-to-day stuff here.",
    createdAt: NOW - 3 * MIN + 2000,
    threadSuggestion: {
      suggestedTitle: "Italy trip",
      reason:
        "This reads like its own project — flights, lodging, budget — separate from the daily logistics in this thread.",
      sourceMessageIds: ["m4"],
      status: "open",
    },
  },
];

const opsCards: OpsCard[] = [
  {
    id: "c1",
    title: "Eli pickup",
    owner: ME_ID,
    when: "tomorrow 3pm",
    bucket: "today",
    status: "pending",
    sourceMessageId: "m1",
    sourceUserId: PARTNER_ID,
    createdAt: NOW - 7 * MIN,
  },
  {
    id: "c2",
    title: "Diapers from CVS",
    owner: ME_ID,
    when: "today",
    bucket: "today",
    status: "pending",
    sourceMessageId: "m1",
    sourceUserId: PARTNER_ID,
    createdAt: NOW - 7 * MIN,
  },
  {
    id: "c3",
    title: "Be home for contractor",
    owner: ME_ID,
    when: "Thursday 9am",
    bucket: "week",
    status: "pending",
    sourceMessageId: "m1",
    sourceUserId: PARTNER_ID,
    createdAt: NOW - 7 * MIN,
    conflictWith: contractorConflict,
  },
  {
    id: "c4",
    title: "Call pediatrician about appt",
    owner: ME_ID,
    when: "this week",
    bucket: "week",
    status: "pending",
    sourceMessageId: "m-prev",
    sourceUserId: PARTNER_ID,
    createdAt: NOW - 18 * HOUR,
    // Jenny tapped "?" on this one — shows the "waiting" chip on load. Posting a
    // message in the thread auto-resolves it (you're the one being asked).
    clarification: {
      note: "which appt — the 6-month checkup or the ear recheck?",
      askedByUserId: PARTNER_ID,
      askedAt: NOW - 30 * MIN,
      status: "open",
    },
  },
  {
    id: "c5",
    title: "Renew car registration",
    owner: PARTNER_ID,
    when: "end of month",
    bucket: "long",
    status: "pending",
    sourceMessageId: "m-prev",
    sourceUserId: ME_ID,
    createdAt: NOW - 2 * 24 * HOUR,
  },
  {
    id: "c6",
    title: "Sunday meal plan",
    owner: ME_ID,
    when: "recurring",
    bucket: "ongoing",
    status: "pending",
    sourceMessageId: "m-prev",
    sourceUserId: ME_ID,
    createdAt: NOW - 3 * 24 * HOUR,
  },
  {
    id: "c7",
    title: "Trash out",
    owner: PARTNER_ID,
    when: "Wednesday night",
    bucket: "ongoing",
    status: "done",
    sourceMessageId: "m-prev",
    sourceUserId: PARTNER_ID,
    createdAt: NOW - 4 * 24 * HOUR,
  },
];

const partnershipThread: PartnershipThread = {
  kind: "partnership",
  id: PREVIEW_PARTNERSHIP_THREAD_ID,
  partnershipId: PARTNERSHIP_ID,
  title: "Shared",
  isDefault: true,
  messages,
  opsCards,
  agentActive: true,
  createdAt: NOW - 30 * 24 * HOUR,
};

const personalThread: PersonalThread = {
  kind: "personal",
  id: PERSONAL_THREAD_ID,
  ownerId: ME_ID,
  messages: [],
  agentActive: true,
  createdAt: NOW - 30 * 24 * HOUR,
};

// Mira-sets-up-a-thread preview. The user asks Mira (in their private thread)
// to spin up a shared room with their partner; she proposes via the same
// suggest-then-confirm card Otis uses, tinted plum. Nothing is created until
// the user taps Start.
const miraMessages: Message[] = [
  {
    id: "pm1",
    author: { kind: "human", userId: ME_ID },
    body: "Can you set up a thread for me and Jenny to plan the Italy trip? Don't want it tangled up with the daily stuff.",
    createdAt: NOW - 6 * MIN,
  },
  {
    id: "pm2",
    author: { kind: "agent" },
    body: "Good call — that's its own project. Want me to open a shared thread with Jenny for it?",
    createdAt: NOW - 6 * MIN + 2000,
    threadSuggestion: {
      suggestedTitle: "Italy trip",
      reason:
        "I'll spin up a shared room with Jenny so flights, lodging, and budget live in one place.",
      sourceMessageIds: [],
      status: "open",
    },
  },
];

const personalThreadWithMira: PersonalThread = {
  ...personalThread,
  messages: miraMessages,
};

export const previewState = {
  status: "ready" as const,
  error: null,
  currentUserId: ME_ID,
  users: [me, partner],
  partnerships: [partnership],
  threads: [personalThread, partnershipThread],
};

// Empty-inbox preview: signed-in user with only their personal Mira thread
// and zero partnerships. Validates the decoupled flow (Mira-as-home,
// partnership-is-additive) and the empty-state copy in ThreadList.
export const previewStateSolo = {
  status: "ready" as const,
  error: null,
  currentUserId: ME_ID,
  users: [me],
  partnerships: [],
  threads: [personalThread],
};

// Mira-thread-setup preview: the personal thread carries Mira's two proposals
// (shared + private). A partnership exists so the shared-thread accept has a
// partner to target. Render via #preview-mira.
export const previewStateMira = {
  status: "ready" as const,
  error: null,
  currentUserId: ME_ID,
  users: [me, partner],
  partnerships: [partnership],
  threads: [personalThreadWithMira, partnershipThread],
};
