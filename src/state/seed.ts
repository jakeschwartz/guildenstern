import type { Partnership, Thread, User } from "../types";

export const seedPartnerships: Partnership[] = [
  { id: "jake-jenny", participantIds: ["jake", "jenny"] },
];

export const seedUsers: User[] = [
  { id: "jake", name: "Jake", initials: "JS" },
  { id: "jenny", name: "Jenny", initials: "JE" },
  { id: "priya", name: "Priya Shah", initials: "PS" },
  { id: "adam", name: "Adam", initials: "AD" },
  { id: "john", name: "John", initials: "JN" },
  { id: "matt", name: "Matt", initials: "MT" },
  { id: "sarah", name: "Sarah", initials: "SR" },
];

// Seed times anchor to "now" so timestamps stay fresh across sessions.
const t0 = Date.now();
const min = (n: number) => t0 + n * 60_000;
const hr = (n: number) => t0 - n * 60 * 60_000;
const days = (n: number) => t0 - n * 24 * 60 * 60_000;

const memberOutreach = (othersPhrase: string) =>
  `Jake's trying to plan dinner with you, ${othersPhrase}, in the next two weeks. What works for you? Any preferences on neighborhood, cuisine, or vibe?`;

const makeFreshRelationship = (
  id: string,
  name: string,
  role: string,
  company: string,
  metWhere: string,
  createdAt: number,
): Thread[] => {
  const firstName = name.split(" ")[0];
  return [
    {
      kind: "relationship",
      id,
      hostId: "jake",
      agentActive: true,
      createdAt,
      contact: { name, role, company, metWhere, metWhen: createdAt },
      intents: [],
      privateWithAgent: [
        {
          id: `${id}-welcome`,
          author: { kind: "agent" },
          body: `Just connected with ${firstName} at ${metWhere}. Quick — anything you want me to remember about them, or what you talked about? Or skip; I can draft a polite note from just the basics.`,
          createdAt,
        },
      ],
      outbound: [],
    },
  ];
};

export const seedThreads: Thread[] = [
  {
    kind: "personal",
    id: "jake-agent",
    ownerId: "jake",
    agentActive: true,
    createdAt: days(120),
    messages: [
      {
        id: "ja-1",
        author: { kind: "agent" },
        body: "Anything on your mind?",
        createdAt: hr(0.5),
        briefing: {
          title: "Morning",
          items: [
            {
              label: "House",
              detail: "Contractor callback today",
              status: "1 on you",
              tone: "attention",
              threadId: "jj-house",
            },
            {
              label: "Decision · with Jenny",
              detail: "Your position not shared",
              status: "on you",
              tone: "deliberation",
              threadId: "jj-arb-contractor",
            },
            {
              label: "Anna Chen",
              detail: "Call confirmed",
              status: "Thu 10:30",
              tone: "agent",
              threadId: "anna-chen",
            },
          ],
        },
      },
      {
        id: "ja-2",
        author: { kind: "human", userId: "jake" },
        body: "remind me to call my dad friday",
        createdAt: hr(0.4),
      },
      {
        id: "ja-3",
        author: { kind: "agent" },
        body: "Set for Friday. Morning, afternoon, or evening?",
        createdAt: hr(0.39),
      },
      {
        id: "ja-4",
        author: { kind: "agent" },
        body: "Also — you added 4 new contacts today (Priya, Marcus, Jen, David). Want to walk through them so I can draft follow-ups? Takes a minute.",
        createdAt: hr(0.1),
      },
    ],
  },
  {
    kind: "personal",
    id: "jenny-agent",
    ownerId: "jenny",
    agentActive: true,
    createdAt: days(90),
    messages: [
      {
        id: "je-1",
        author: { kind: "agent" },
        body: "Morning. You shared your position on the contractor — Jake hasn't yet. I'll let you know when he does. Anything else on your mind?",
        createdAt: hr(0.5),
      },
    ],
  },
  {
    kind: "group",
    id: "dinner-soon",
    title: "Dinner soon?",
    hostId: "jake",
    memberIds: ["jake", "adam", "john", "matt", "sarah"],
    agentActive: true,
    createdAt: t0,
    messages: [
      {
        id: "m1",
        author: { kind: "human", userId: "jake" },
        body: "We should get dinner sometime in the next two weeks. Agent, can you handle it?",
        createdAt: min(0),
      },
      {
        id: "m2",
        author: { kind: "agent" },
        body: "On it. I'll reach out to everyone privately and come back with options.",
        createdAt: min(1),
      },
    ],
    spokes: {
      jake: {
        memberId: "jake",
        awaitingMember: false,
        messages: [
          {
            id: "s-jake-1",
            author: { kind: "agent" },
            body: "Reaching out to Adam, John, Matt, and Sarah now. I'll come back to you when I have something to confirm.",
            createdAt: min(2),
          },
        ],
      },
      adam: {
        memberId: "adam",
        awaitingMember: true,
        messages: [
          {
            id: "s-adam-1",
            author: { kind: "agent" },
            body: memberOutreach("John, Matt, and Sarah"),
            createdAt: min(3),
          },
        ],
      },
      john: {
        memberId: "john",
        awaitingMember: true,
        messages: [
          {
            id: "s-john-1",
            author: { kind: "agent" },
            body: memberOutreach("Adam, Matt, and Sarah"),
            createdAt: min(3),
          },
        ],
      },
      matt: {
        memberId: "matt",
        awaitingMember: true,
        messages: [
          {
            id: "s-matt-1",
            author: { kind: "agent" },
            body: memberOutreach("Adam, John, and Sarah"),
            createdAt: min(3),
          },
        ],
      },
      sarah: {
        memberId: "sarah",
        awaitingMember: true,
        messages: [
          {
            id: "s-sarah-1",
            author: { kind: "agent" },
            body: memberOutreach("Adam, John, and Matt"),
            createdAt: min(3),
          },
        ],
      },
    },
  },
  ...makeFreshRelationship(
    "rel-marcus",
    "Marcus Lee",
    "VP Engineering",
    "Linear",
    "SF Tech Week",
    hr(5),
  ),
  ...makeFreshRelationship(
    "rel-jen",
    "Jen Tanaka",
    "Head of Design",
    "Figma",
    "SF Tech Week",
    hr(3),
  ),
  ...makeFreshRelationship(
    "rel-david",
    "David Cho",
    "Founder",
    "Replicate",
    "SF Tech Week",
    hr(1.5),
  ),
  {
    kind: "relationship",
    id: "anna-chen",
    hostId: "jake",
    agentActive: true,
    createdAt: days(3),
    contact: {
      name: "Anna Chen",
      role: "Director of Engineering",
      company: "Stripe",
      metWhere: "TechWeek",
      metWhen: days(3),
    },
    intents: [
      {
        id: "i-1",
        body: "30-min call about hiring within two weeks",
        proposedAt: days(3),
        status: "ratified",
        ratifiedAt: days(2),
      },
      {
        id: "i-2",
        body: "Trade notes on YC partners worth knowing",
        proposedAt: days(1),
        status: "awaiting-them",
      },
    ],
    privateWithAgent: [
      {
        id: "p-1",
        author: { kind: "agent" },
        body: "Captured your conversation with Anna. She's heading eng at Stripe, hiring two staff-level roles. You offered to share thoughts on who's good. Want me to draft an intro to YC partners you mentioned?",
        createdAt: days(3) + 60 * 60_000,
      },
      {
        id: "p-2",
        author: { kind: "human", userId: "jake" },
        body: "Not yet. Let's get the call on the calendar first, then I'll send a list.",
        createdAt: days(3) + 90 * 60_000,
      },
      {
        id: "p-3",
        author: { kind: "agent" },
        body: "Reached out to Anna with the call ask. She replied — call locked for Thursday 10:30 her time. I'll remind you the morning of.",
        createdAt: days(2),
      },
    ],
    outbound: [
      {
        id: "o-1",
        author: { kind: "agent" },
        body: "Hi Anna — Jake asked me to follow up on the conversation you had at TechWeek. He'd like to set up a 30-min call about hiring sometime in the next two weeks. Any time work?",
        createdAt: days(3) + 2 * 60 * 60_000,
      },
      {
        id: "o-2",
        author: { kind: "external", name: "Anna Chen", via: "email" },
        body: "Thursday 10:30 PT works. Sending an invite.",
        createdAt: days(2),
      },
    ],
  },
  {
    kind: "partnership",
    id: "jj-default",
    partnershipId: "jake-jenny",
    title: "Default",
    isDefault: true,
    agentActive: true,
    createdAt: days(120),
    messages: [
      {
        id: "djj-1",
        author: { kind: "human", userId: "jenny" },
        body: "can you pick up Eli at 3:30, we need diapers, did you call the contractor?",
        createdAt: hr(2),
      },
      {
        id: "djj-2",
        author: { kind: "agent" },
        body: "Got it — filing across our threads:\n• Eli pickup → Kids\n• Diapers, contractor → House\nSound right?",
        createdAt: hr(2) + 30_000,
      },
      {
        id: "djj-3",
        author: { kind: "human", userId: "jenny" },
        body: "yep eli has a fever",
        createdAt: hr(2) + 90_000,
      },
      {
        id: "djj-4",
        author: { kind: "agent" },
        body: "Updated the Kids card — \"early pickup, fever.\" Jake will see it.",
        createdAt: hr(2) + 120_000,
      },
      {
        id: "djj-5",
        author: { kind: "human", userId: "jenny" },
        body: "❤️ miss you",
        createdAt: hr(0.5),
      },
      {
        id: "djj-6",
        author: { kind: "human", userId: "jake" },
        body: "❤️ miss you too",
        createdAt: hr(0.4),
      },
    ],
    opsCards: [],
  },
  {
    kind: "partnership",
    id: "jj-kids",
    partnershipId: "jake-jenny",
    title: "Kids",
    isDefault: false,
    agentActive: true,
    createdAt: days(120),
    messages: [
      {
        id: "kjj-1",
        author: { kind: "agent" },
        body: "From Jenny (Default thread): early pickup ask for Eli today — has a fever.",
        createdAt: hr(2) + 60_000,
      },
      {
        id: "kjj-2",
        author: { kind: "agent" },
        body: "Jake confirmed Eli pickup at 3:30. He's on it.",
        createdAt: hr(1),
      },
    ],
    opsCards: [
      {
        id: "op-eli",
        title: "Early pickup · 3:30 today",
        subtitle: "Eli — fever",
        owner: "jake",
        when: "Today 3:30",
        bucket: "today",
        status: "done",
        sourceMessageId: "djj-1",
        sourceUserId: "jenny",
        createdAt: hr(2),
      },
    ],
  },
  {
    kind: "arbitration",
    id: "jj-arb-contractor",
    partnershipId: "jake-jenny",
    question: "Contractor A or B for the kitchen renovation?",
    agentActive: true,
    createdAt: hr(8),
    positions: [
      {
        party: "jake",
        body: "A. $4,800 fits the budget and we're tight on cash flow this quarter. We can live with basic.",
      },
      {
        party: "jenny",
        body: "B. The reviews are night and day, and I'm tired of cheap-out regrets. $1,400 over budget is worth it.",
      },
    ],
    options: [
      {
        id: "opt-a",
        label: "Contractor A",
        detail: "$4,800 · basic scope · within budget",
        proposedBy: "jake",
      },
      {
        id: "opt-b",
        label: "Contractor B",
        detail: "$6,200 · stronger reviews · 2-year warranty",
        proposedBy: "jenny",
      },
      {
        id: "opt-c",
        label: "Contractor B, renegotiated scope",
        detail: "Target $5,400 — agent's read of B's quote sheet",
        proposedBy: "agent",
      },
    ],
    decision: null,
    messages: [
      {
        id: "arb-1",
        author: { kind: "agent" },
        body: "Want to confirm we're deciding between contractor A and B for the kitchen?",
        createdAt: hr(7.5),
        reactions: [
          { userId: "jake", kind: "agreed", at: hr(7.4) },
          { userId: "jenny", kind: "agreed", at: hr(7.3) },
        ],
      },
      {
        id: "arb-2",
        author: { kind: "agent" },
        body: "Jenny's shared where she's landing — quality fatigue, willing to go $1,400 over budget for the right contractor. Jake, share when you're ready.",
        createdAt: hr(6),
        reactions: [
          { userId: "jenny", kind: "agreed", at: hr(5.9) },
          { userId: "jake", kind: "sitting-with", at: hr(5) },
        ],
      },
      {
        id: "arb-3",
        author: { kind: "agent" },
        body: "Reading both: you don't actually disagree on quality, you disagree on how to handle going over budget under cash-flow stress. I added a third option (B with renegotiated scope, target $5,400). Does that hold the tension?",
        createdAt: hr(4),
        reactions: [
          { userId: "jenny", kind: "not-quite", at: hr(3.5) },
        ],
      },
    ],
    ventSpokes: {
      jenny: {
        userId: "jenny",
        positionRatified: true,
        messages: [
          {
            id: "vj-1",
            author: { kind: "agent" },
            body: "What's coming up for you on the contractor thing?",
            createdAt: hr(7),
          },
          {
            id: "vj-2",
            author: { kind: "human", userId: "jenny" },
            body: "I'm so frustrated. He's always trying to save money on the wrong things.",
            createdAt: hr(6.9),
          },
          {
            id: "vj-3",
            author: { kind: "agent" },
            body: "What's the wrong thing here, specifically?",
            createdAt: hr(6.85),
          },
          {
            id: "vj-4",
            author: { kind: "human", userId: "jenny" },
            body: "Quality. I'm tired of cheap-out regrets. We've done this dance before with the bathroom.",
            createdAt: hr(6.8),
          },
          {
            id: "vj-5",
            author: { kind: "agent" },
            body: "I hear you. So if I'm reading it: quality matters more than the $1,400 delta, and you'd take the budget hit for B. Fair statement?",
            createdAt: hr(6.7),
          },
          {
            id: "vj-6",
            author: { kind: "human", userId: "jenny" },
            body: "yeah, that's it.",
            createdAt: hr(6.65),
          },
          {
            id: "vj-7",
            author: { kind: "agent" },
            body: "Want me to share that as your position in the shared view? Jake will see what you've landed on, not the venting.",
            createdAt: hr(6.6),
          },
          {
            id: "vj-8",
            author: { kind: "human", userId: "jenny" },
            body: "yes",
            createdAt: hr(6.55),
          },
          {
            id: "vj-9",
            author: { kind: "agent" },
            body: "Done. I framed it as: \"quality fatigue, willing to go $1,400 over for the right contractor.\" That's now visible to Jake when he opens the thread.",
            createdAt: hr(6.5),
          },
        ],
      },
      jake: {
        userId: "jake",
        positionRatified: false,
        messages: [
          {
            id: "vk-1",
            author: { kind: "agent" },
            body: "Want to talk through where you're landing on the contractor thing? No rush — Jenny's shared, but you can take your time.",
            createdAt: hr(5.5),
          },
        ],
      },
    },
  },
  {
    kind: "partnership",
    id: "jj-house",
    partnershipId: "jake-jenny",
    title: "House",
    isDefault: false,
    agentActive: true,
    createdAt: days(120),
    messages: [
      {
        id: "hjj-1",
        author: { kind: "agent" },
        body: "From Jenny (Default thread): two House items — contractor callback (Jenny wants final price) and diapers for the weekend.",
        createdAt: hr(2) + 60_000,
      },
    ],
    opsCards: [
      {
        id: "op-contractor",
        title: "Callback — contractor",
        subtitle: "Jenny needs final price",
        owner: "jake",
        when: "Today",
        bucket: "today",
        status: "pending",
        sourceMessageId: "djj-1",
        sourceUserId: "jenny",
        createdAt: hr(2),
      },
      {
        id: "op-diapers",
        title: "Diapers",
        subtitle: "Grocery weekend",
        owner: "jenny",
        when: "Saturday",
        bucket: "week",
        status: "pending",
        sourceMessageId: "djj-1",
        sourceUserId: "jenny",
        createdAt: hr(2),
      },
    ],
  },
];
