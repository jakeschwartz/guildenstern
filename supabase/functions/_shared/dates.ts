// Shared date resolution for agents that file items (agent-respond, scan-gmail).
// "tomorrow" must become a real date the moment an item is filed, or it
// stays "tomorrow" forever. Callers tell the model the person's local now +
// a lookup calendar, and convert its due_date/due_time back to UTC here.

export const DEFAULT_TZ = "America/New_York";

export const isValidTz = (tz: string | null | undefined): tz is string => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// "Wednesday, November 11, 2026, 2:34 PM" in the given zone.
export const describeNow = (now: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

// A lookup calendar of local days, one Monday–Sunday week per line, because
// models are unreliable at weekday arithmetic ("Thursday" from a Wednesday
// came back as Friday's date; "next Wednesday" from a Monday skipped a week).
// With this, resolving a weekday is a lookup, not math.
//
// `from` lets a caller start earlier than today: scan-gmail resolves an
// email's relative dates from the day it was received, which can be days ago.
//   Week of Nov 9:  Mon 2026-11-09, Tue 2026-11-10, Wed 2026-11-11 (today), ...
export const upcomingCalendar = (now: Date, tz: string, from?: Date) => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Calendar dates in the person's zone, then step whole calendar days in UTC
  // (a date's weekday doesn't depend on timezone), so neither DST nor a
  // far-from-UTC zone can skip or repeat a day.
  const ymd = (date: Date) => fmt.format(date).split("-").map(Number);
  const [ty, tm, td] = ymd(now);
  const todayUtc = Date.UTC(ty, tm - 1, td, 12);
  const [fy, fm, fd] = ymd(from && from < now ? from : now);
  const fromUtc = Date.UTC(fy, fm - 1, fd, 12);
  const DAY = 24 * 60 * 60 * 1000;
  // Back up to the Monday of the start week, run two full weeks past today.
  const startDow = (new Date(fromUtc).getUTCDay() + 6) % 7; // Mon = 0
  const start = fromUtc - startDow * DAY;
  const todayDow = (new Date(todayUtc).getUTCDay() + 6) % 7;
  const end = todayUtc + (6 - todayDow + 14) * DAY;

  const utcDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const utcWk = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
  const utcMd = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  const weeks: string[] = [];
  for (let wk = start; wk <= end; wk += 7 * DAY) {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const at = wk + i * DAY;
      const tag = at === todayUtc ? " (today)" : at === todayUtc + DAY ? " (tomorrow)" : "";
      days.push(`${utcWk.format(at)} ${utcDay.format(at)}${tag}`);
    }
    weeks.push(`Week of ${utcMd.format(wk)}: ${days.join(", ")}`);
  }
  return `Calendar, one Monday–Sunday week per line. Look up weekdays and relative days ("tomorrow", "Thursday") here instead of computing them. A bare weekday is its next occurrence after the reference day; "next <weekday>" is that day in the week AFTER the reference day's week; an explicit date, even beyond this calendar ("12/31"), is used as written.\n${weeks.join("\n")}`;
};

// Offset (ms) of `tz` from UTC at the given instant.
export const tzOffsetMs = (instant: number, tz: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant;
};

// Local wall time in `tz` → UTC ISO string. Two passes handle DST edges.
// Date-only items are pinned to local noon so the calendar day survives a
// partner in a slightly different timezone.
export const resolveDue = (
  dueDate: string | undefined,
  dueTime: string | undefined,
  tz: string,
): { due_at: string; due_has_time: boolean } | null => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dueDate ?? "").trim());
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec((dueTime ?? "").trim());
  const hasTime = Boolean(t);
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = hasTime ? [Number(t![1]), Number(t![2])] : [12, 0];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  let instant = wall - tzOffsetMs(wall, tz);
  instant = wall - tzOffsetMs(instant, tz);
  return { due_at: new Date(instant).toISOString(), due_has_time: hasTime };
};

