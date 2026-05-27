import { useEffect, useSyncExternalStore } from "react";
import type {
  Message,
  MessageId,
  MutualIntent,
  Partnership,
  RelationshipCard,
  RelationshipThread,
  Thread,
  ThreadId,
  User,
  UserId,
} from "../types";
import { seedPartnerships, seedThreads, seedUsers } from "./seed";

const generateDraftBody = (
  contact: RelationshipCard,
  intents: MutualIntent[],
): string => {
  const firstName = contact.name.split(" ")[0];
  const opening = `Hi ${firstName} — Jake asked me to follow up on the conversation you had at ${contact.metWhere}.`;
  const bodies = intents
    .filter((i) => i.status !== "expired")
    .map((i) => i.body);
  const lines: string[] = [];
  if (bodies.includes("30-min call within 2 weeks")) {
    lines.push(
      `He'd love to set up a 30-min call in the next couple weeks — any time work for you?`,
    );
  }
  if (bodies.includes("Trade notes async")) {
    lines.push(
      `He's also open to trading notes async if a call doesn't quite fit.`,
    );
  }
  if (bodies.includes("Send them something")) {
    lines.push(
      `He mentioned wanting to send you something — I'll prompt him to dig it up and follow up shortly.`,
    );
  }
  if (bodies.includes("Make an intro")) {
    lines.push(
      `He's thinking about an intro and will follow up when he's lined up the details.`,
    );
  }
  if (bodies.includes("Stay in touch")) {
    lines.push(`He wanted to make sure you stay on his radar.`);
  }
  const body =
    lines.length > 0
      ? lines.join("\n\n")
      : `He wanted me to make sure you have a way to reach him.`;
  return `${opening}\n\n${body}\n\n— Jake's agent`;
};

type State = {
  users: User[];
  partnerships: Partnership[];
  threads: Thread[];
  currentUserId: UserId;
};

const STORAGE_KEY = "guildenstern:v10";

const load = (): State => {
  if (typeof window === "undefined") return fresh();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as State;
    if (!parsed.users || !parsed.threads || !parsed.partnerships)
      return fresh();
    return parsed;
  } catch {
    return fresh();
  }
};

const fresh = (): State => ({
  users: seedUsers,
  partnerships: seedPartnerships,
  threads: seedThreads,
  currentUserId: "jake",
});

let state: State = load();
const listeners = new Set<() => void>();

const emit = () => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
};

export const getState = () => state;

export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const setCurrentUser = (id: UserId) => {
  state = { ...state, currentUserId: id };
  emit();
};

export const resetState = () => {
  state = fresh();
  emit();
};

export const createRelationshipThread = (
  hostId: UserId,
  contact: RelationshipCard,
): ThreadId => {
  const id: ThreadId = `rel-${contact.name.toLowerCase().replace(/[^a-z]+/g, "-")}-${Date.now()}`;
  const now = Date.now();
  const firstName = contact.name.split(" ")[0];
  const welcome = {
    id: `${id}-welcome`,
    author: { kind: "agent" as const },
    body: `Just connected with ${firstName} at ${contact.metWhere}. Quick — anything you want me to remember about them, or what you talked about? Or skip; I can draft a polite note from just the basics.`,
    createdAt: now,
  };
  const thread: RelationshipThread = {
    kind: "relationship",
    id,
    hostId,
    contact,
    intents: [],
    privateWithAgent: [welcome],
    outbound: [],
    agentActive: true,
    createdAt: now,
  };
  state = { ...state, threads: [thread, ...state.threads] };
  emit();
  return id;
};

const ACK_FOR_CHIP: Record<string, string> = {
  "30-min call within 2 weeks":
    "Got it — 30-min call within 2 weeks. I'll work that into the outbound draft.",
  "Trade notes async":
    "Got it — trade notes async. I'll keep it lightweight in the draft.",
  "Send them something":
    "Got it — send something. What do you want me to attach or reference?",
  "Make an intro":
    "Got it — make an intro. Who's on the other end? I'll line it up.",
  "Stay in touch":
    "Got it — stay in touch. I'll resurface them in a month if nothing happens before then.",
};

const upsertDraft = (
  thread: RelationshipThread,
): RelationshipThread => {
  const draftId = `draft-${thread.id}`;
  const body = generateDraftBody(thread.contact, thread.intents);
  const draftMsg: Message = {
    id: draftId,
    author: { kind: "agent" },
    body,
    createdAt: Date.now(),
    draft: true,
  };
  const existingIdx = thread.outbound.findIndex(
    (m) => m.draft && m.id === draftId,
  );
  let newOutbound: Message[];
  if (existingIdx >= 0) {
    newOutbound = [...thread.outbound];
    newOutbound[existingIdx] = draftMsg;
  } else {
    newOutbound = [...thread.outbound, draftMsg];
  }
  return { ...thread, outbound: newOutbound };
};

export const proposeDraftForThread = (threadId: ThreadId) => {
  state = {
    ...state,
    threads: state.threads.map((t) => {
      if (t.id !== threadId) return t;
      if (t.kind !== "relationship") return t;
      return upsertDraft(t);
    }),
  };
  emit();
};

export const sendDraft = (threadId: ThreadId, messageId: MessageId) => {
  const now = Date.now();
  state = {
    ...state,
    threads: state.threads.map((t) => {
      if (t.id !== threadId) return t;
      if (t.kind !== "relationship") return t;
      return {
        ...t,
        outbound: t.outbound.map((m) =>
          m.id === messageId
            ? { ...m, draft: false, createdAt: now }
            : m,
        ),
      };
    }),
  };
  emit();
};

export const addIntentFromChip = (threadId: ThreadId, body: string) => {
  const now = Date.now();
  const newIntent: MutualIntent = {
    id: `intent-${threadId}-${now}`,
    body,
    proposedAt: now,
    status: "awaiting-them",
  };
  const ack = ACK_FOR_CHIP[body] ?? `Got it — ${body}.`;
  const ackMsg: Message = {
    id: `msg-${threadId}-${now}`,
    author: { kind: "agent" },
    body: ack,
    createdAt: now,
  };
  state = {
    ...state,
    threads: state.threads.map((t) => {
      if (t.id !== threadId) return t;
      if (t.kind !== "relationship") return t;
      const withIntent: RelationshipThread = {
        ...t,
        intents: [...t.intents, newIntent],
        privateWithAgent: [...t.privateWithAgent, ackMsg],
      };
      return upsertDraft(withIntent);
    }),
  };
  emit();
};

export const useStore = <T,>(selector: (s: State) => T): T =>
  useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );

export const useHydratedReset = () => {
  useEffect(() => {
    // Surface reset for the dev console.
    (window as unknown as { __reset?: () => void }).__reset = resetState;
  }, []);
};
