// Mira's rundown push: draft every variant that has something real to say,
// then pick one. Pure functions (no Deno APIs, no I/O) so they can be tested
// directly; index.ts gathers the data and sends.
//
// The variants are an experiment. For the first two weeks of a person's
// rundowns Mira picks evenly at random among the eligible ones; after that she
// favors whichever variants got the app opened (a tap, or an open within 30
// minutes), keeping 1 in 5 for the others so we keep learning.

export type Slot = "am" | "pm";

export type VariantId =
  | "count"
  | "question"
  | "list_item"
  | "new_from_partner"
  | "day"
  | "win"
  | "invitation";

export type CardFact = {
  id: string;
  threadId: string;
  title: string;
  ownerId: string;
  sourceUserId: string | null;
  status: "pending" | "accepted" | "done" | "deferred";
  createdAt: number;
  doneAt: number | null;
  clarification: { note: string; askedByUserId: string; status: "open" | "resolved" } | null;
};

export type EventFact = { title: string; start: number };

export type RundownInput = {
  userId: string;
  partnerId: string | null;
  partnerFirst: string | null;
  personalThreadId: string | null;
  slot: Slot;
  // Cards your partner added after this count as new.
  sinceLastLook: number;
  // Cards finished after this count as handled.
  handledSince: number;
  cards: CardFact[];
  // Your remaining timed calendar events today (morning only).
  events: EventFact[];
  // Local clock time, e.g. "9:30" or "3".
  formatTime: (ms: number) => string;
  invitationsThisWeek: number;
};

export type Candidate = {
  variant: VariantId;
  body: string;
  // Thread a tap should open; null opens the inbox, where the rundown is.
  threadId: string | null;
};

export const PUSH_TITLE = "🟣 Mira";
export const INVITATIONS_PER_WEEK = 2;
export const EXPLORE_DAYS = 14;
export const EXPLORE_SHARE = 0.2;
export const OPEN_WINDOW_MS = 30 * 60 * 1000;

const isOpen = (c: CardFact) => c.status === "pending" || c.status === "accepted";
const tidy = (s: string) => s.trim().replace(/[.!?\s]+$/, "");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "A, B and C" / "A, B and 3 more"
function titleList(titles: string[]): string {
  const t = titles.map(tidy);
  if (t.length === 1) return t[0]!;
  if (t.length <= 3) return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
  return `${t.slice(0, 2).join(", ")} and ${t.length - 2} more`;
}

export type Facts = {
  questions: CardFact[];
  fresh: CardFact[];
  list: CardFact[];
  handled: CardFact[];
};

export function factsFor(input: RundownInput): Facts {
  const { userId, partnerId, cards } = input;
  const byCreated = (a: CardFact, b: CardFact) => a.createdAt - b.createdAt;

  // Your partner tapped "?" on a card: they're waiting on your answer.
  const questions = cards
    .filter((c) => c.clarification?.status === "open" && c.clarification.askedByUserId !== userId)
    .sort(byCreated);
  // Open cards your partner put on you since you last looked.
  const fresh = cards
    .filter((c) =>
      c.ownerId === userId && isOpen(c) && partnerId !== null &&
      c.sourceUserId === partnerId && c.createdAt > input.sinceLastLook
    )
    .sort(byCreated);
  const freshIds = new Set(fresh.map((c) => c.id));
  // Everything else open on your list, oldest first.
  const list = cards
    .filter((c) => c.ownerId === userId && isOpen(c) && !freshIds.has(c.id))
    .sort(byCreated);
  // Things you asked for that someone else finished.
  const handled = cards
    .filter((c) =>
      c.sourceUserId === userId && c.ownerId !== userId && c.status === "done" &&
      c.doneAt !== null && c.doneAt > input.handledSince
    )
    .sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));

  return { questions, fresh, list, handled };
}

export function draftCandidates(input: RundownInput): Candidate[] {
  const { slot } = input;
  const p = input.partnerFirst ?? "Your partner";
  const hasPartner = input.partnerId !== null;
  const { questions, fresh, list, handled } = factsFor(input);
  const out: Candidate[] = [];

  // The count: what's waiting, without saying which.
  const parts: string[] = [];
  if (questions.length) {
    parts.push(questions.length === 1 ? `${p} has a question for you` : `${p} has ${questions.length} questions for you`);
  }
  if (fresh.length) {
    parts.push(fresh.length === 1 ? `${p} added one thing for you` : `${p} added ${fresh.length} things for you`);
  }
  if (list.length) {
    const today = slot === "am" ? " today" : "";
    parts.push(list.length === 1 ? `one thing is on your list${today}` : `${list.length} things are on your list${today}`);
  }
  if (parts.length) {
    const [first, second] = parts;
    // "Jake has a question for you and added one thing for you", not "…, and Jake added…"
    const joined = !second
      ? first!
      : second.startsWith(`${p} `)
      ? `${first} and ${second.slice(p.length + 1)}`
      : `${first}, and ${second}`;
    const sentence = capitalize(joined) + ".";
    out.push({ variant: "count", body: (slot === "am" ? "Morning. " : "") + sentence, threadId: null });
  }

  // Your partner's question, verbatim. Opens the thread to answer it.
  const q = questions[0];
  if (q) {
    const note = q.clarification?.note.trim() ?? "";
    out.push({
      variant: "question",
      body: note
        ? `${p} asked about “${tidy(q.title)}”: ${note}`
        : `${p} has a question about “${tidy(q.title)}”.`,
      threadId: q.threadId,
    });
  }

  // The oldest thing on your list.
  const oldest = list[0];
  if (oldest) {
    out.push({
      variant: "list_item",
      body: `Still on your list: ${tidy(oldest.title)}. Two minutes to knock it out?`,
      threadId: null,
    });
  }

  // What your partner just added for you.
  if (fresh.length && hasPartner) {
    out.push({
      variant: "new_from_partner",
      body: fresh.length === 1
        ? `${p} added one for you: ${tidy(fresh[0]!.title)}.`
        : `${p} added ${fresh.length} things for you: ${titleList(fresh.map((c) => c.title))}.`,
      threadId: null,
    });
  }

  // Your day, from the calendar. Morning only.
  if (slot === "am" && input.events.length) {
    const shown = input.events.slice(0, 3).map((e) => `${tidy(e.title)} at ${input.formatTime(e.start)}`);
    const more = input.events.length > 3 ? `, +${input.events.length - 3} more` : "";
    out.push({ variant: "day", body: `Today: ${shown.join(", ")}${more}.`, threadId: null });
  }

  // A win. Evening only.
  if (slot === "pm" && handled.length && hasPartner) {
    out.push({
      variant: "win",
      body: handled.length === 1
        ? `${p} took care of “${tidy(handled[0]!.title)}”. One less thing.`
        : `${p} took care of ${handled.length} of your things today: ${titleList(handled.map((c) => c.title))}.`,
      threadId: null,
    });
  }

  // An invitation to start the loop. Evening only, capped per week, and the
  // one variant allowed when nothing else has anything to say.
  if (
    slot === "pm" && hasPartner && input.personalThreadId &&
    input.invitationsThisWeek < INVITATIONS_PER_WEEK
  ) {
    out.push({
      variant: "invitation",
      body: `Anything for tomorrow? Tell me and I'll get it in front of ${p}.`,
      threadId: input.personalThreadId,
    });
  }

  return out;
}

// ---------- picking ----------

export type SentRundown = { variant: string; sentAt: number; openedAt: number | null };

export type VariantScore = { sent: number; converted: number };

// A rundown "converted" if it was tapped, or the app was opened within 30
// minutes of it arriving.
export function scoreVariants(history: SentRundown[], opens: number[]): Map<string, VariantScore> {
  const scores = new Map<string, VariantScore>();
  for (const h of history) {
    const s = scores.get(h.variant) ?? { sent: 0, converted: 0 };
    s.sent += 1;
    const opened = h.openedAt !== null ||
      opens.some((o) => o >= h.sentAt && o <= h.sentAt + OPEN_WINDOW_MS);
    if (opened) s.converted += 1;
    scores.set(h.variant, s);
  }
  return scores;
}

export type Pick = { candidate: Candidate; mode: "explore" | "best" | "explore_other" };

export function pickCandidate(
  candidates: Candidate[],
  history: SentRundown[],
  opens: number[],
  now: number,
  rng: () => number = Math.random,
): Pick | null {
  if (!candidates.length) return null;
  const any = (list: Candidate[]) => list[Math.floor(rng() * list.length)]!;

  const firstSent = history.length ? Math.min(...history.map((h) => h.sentAt)) : null;
  const exploring = firstSent === null || now - firstSent < EXPLORE_DAYS * 24 * 60 * 60 * 1000;
  if (exploring || candidates.length === 1) return { candidate: any(candidates), mode: "explore" };

  // Smoothed open rate, so a variant with no history starts at 50%.
  const scores = scoreVariants(history, opens);
  const rate = (c: Candidate) => {
    const s = scores.get(c.variant) ?? { sent: 0, converted: 0 };
    return (s.converted + 1) / (s.sent + 2);
  };
  const top = Math.max(...candidates.map(rate));
  const best = candidates.filter((c) => rate(c) === top);
  const others = candidates.filter((c) => rate(c) !== top);
  if (others.length && rng() < EXPLORE_SHARE) return { candidate: any(others), mode: "explore_other" };
  return { candidate: any(best), mode: "best" };
}
