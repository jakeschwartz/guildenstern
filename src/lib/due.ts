// Live due-date rendering for ops cards. The server resolves "tomorrow" to a
// real date when the item is filed; everything here is computed against the
// current clock at render time, so labels and buckets move on their own:
// "Tomorrow 3pm" → "Today 3pm" → "Yesterday 3pm".

import type { OpsBucket, OpsCard } from "../types";

const DAY = 24 * 60 * 60 * 1000;

// Local midnight of the day containing `ms`.
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Whole calendar days from today to the due day (0 = today, 1 = tomorrow,
// -1 = yesterday). Rounded so DST days (23h/25h) still count as one.
export const daysUntil = (dueAt: number, now: number = Date.now()) =>
  Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY);

const timeLabel = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 12 && m === 0) return "noon";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "am" : "pm";
  return m === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
};

// "Today 3pm", "Tomorrow", "Thu 9am", "Nov 20", "Yesterday", "Overdue · Mon".
// Falls back to the sender's phrase for undated items ("this week").
export const formatDue = (card: OpsCard, now: number = Date.now()): string => {
  if (card.dueAt === undefined) return card.when;
  const days = daysUntil(card.dueAt, now);
  const time = card.dueHasTime ? ` ${timeLabel(card.dueAt)}` : "";
  const d = new Date(card.dueAt);

  let day: string;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Tomorrow";
  else if (days === -1) day = "Yesterday";
  else if (days > 1 && days < 7)
    day = d.toLocaleDateString("en-US", { weekday: "short" });
  else day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (days < -1) return `Overdue · ${day}${time}`;
  return `${day}${time}`;
};

// A dated item past due that isn't done yet.
export const isOverdue = (card: OpsCard, now: number = Date.now()) =>
  card.dueAt !== undefined &&
  card.status !== "done" &&
  (card.dueHasTime ? card.dueAt < now : daysUntil(card.dueAt, now) < 0);

// Bucket computed from the real date when there is one, so an item filed
// "next Thursday" slides from This week into Today on its own. Overdue
// items surface in Today. Undated items keep the bucket Otis chose.
export const effectiveBucket = (
  card: OpsCard,
  now: number = Date.now(),
): OpsBucket => {
  if (card.dueAt === undefined) return card.bucket;
  const days = daysUntil(card.dueAt, now);
  if (days <= 1) return "today";
  if (days < 7) return "week";
  return "long";
};
