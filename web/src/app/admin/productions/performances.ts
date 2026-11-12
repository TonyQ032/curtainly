import { addDays, isIsoDate, TIME_24H, weekday } from '@curtainly/shared';

/**
 * Performance rows as the admin edits them: local date and time in the venue's
 * region timezone. Shared by the client editor and the server-side schema.
 */
export type PerformanceRow = {
  date: string;
  time: string;
  /** Venue override; '' means the production's venue. */
  venueId: string;
  notes: string;
};

export const MAX_PERFORMANCES = 400;
/** Longest span the bulk generator will walk, so a typo'd year can't hang the page. */
export const MAX_SCHEDULE_DAYS = 731;

export const WEEKDAYS = [
  { value: 0, short: 'Sun', long: 'Sunday' },
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
] as const;

/** One line of a weekly schedule: these weekdays at this time. */
export type ScheduleSlot = { days: number[]; time: string };

export type Schedule = { from: string; to: string; slots: ScheduleSlot[] };

export const slotKey = (date: string, time: string) => `${date} ${time}`;

/** Why a schedule can't generate anything yet, or undefined if it can. */
export function scheduleProblem(s: Schedule): string | undefined {
  if (!isIsoDate(s.from) || !isIsoDate(s.to)) return 'Pick the first and last dates.';
  if (s.to < s.from) return 'The last date is before the first.';
  if (dayCount(s.from, s.to) > MAX_SCHEDULE_DAYS) return 'Keep the schedule under two years.';
  const usable = s.slots.filter((slot) => slot.days.length > 0 && TIME_24H.test(slot.time));
  if (usable.length === 0) return 'Pick at least one day and a time.';
  return undefined;
}

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

/**
 * Every date + time the schedule produces, in order, without repeats.
 * E.g. Thu–Sat 19:30 and Sat–Sun 14:00 between two dates.
 */
export function generateSchedule(s: Schedule): { date: string; time: string }[] {
  if (scheduleProblem(s)) return [];
  const slots = s.slots.filter((slot) => slot.days.length > 0 && TIME_24H.test(slot.time));
  const out: { date: string; time: string }[] = [];
  const seen = new Set<string>();
  for (let date = s.from; date <= s.to; date = addDays(date, 1)) {
    const day = weekday(date);
    const times = slots
      .filter((slot) => slot.days.includes(day))
      .map((slot) => slot.time)
      .sort();
    for (const time of times) {
      const key = slotKey(date, time);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date, time });
    }
  }
  return out;
}

export function sortRows<T extends { date: string; time: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => slotKey(a.date, a.time).localeCompare(slotKey(b.date, b.time)));
}

/**
 * Add generated performances to the list, skipping ones already listed.
 * Returns the merged list (sorted) and how many were added and skipped.
 */
export function mergeRows(
  existing: PerformanceRow[],
  added: { date: string; time: string }[],
): { rows: PerformanceRow[]; added: number; skipped: number } {
  const seen = new Set(existing.map((r) => slotKey(r.date, r.time)));
  const fresh: PerformanceRow[] = [];
  for (const a of added) {
    const key = slotKey(a.date, a.time);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ date: a.date, time: a.time, venueId: '', notes: '' });
  }
  return {
    rows: sortRows([...existing, ...fresh]),
    added: fresh.length,
    skipped: added.length - fresh.length,
  };
}
