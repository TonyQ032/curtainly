/**
 * Wall-clock dates and times in a Region's IANA timezone, without a date library.
 * Performances are stored as timestamptz; admins and adapters work in local time
 * ("Thu 7:30 PM in San Diego"). Dates are ISO `YYYY-MM-DD`, times are 24-hour `HH:MM`.
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Is `date` a real calendar date in ISO form (rejects 2027-02-30)? */
export function isIsoDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

function dateToUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** `2027-03-04` + 3 days → `2027-03-07`. */
export function addDays(date: string, days: number): string {
  return new Date(dateToUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(dateToUtcMs(date)).getUTCDay();
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(instant: number, timeZone: string) {
  let dtf = formatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, dtf);
  }
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(instant))) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in ms (local − UTC). */
function offsetAt(instant: number, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a wall-clock time happens in `timeZone`.
 * For a time skipped by a DST change (2:30 AM on spring-forward day) it returns
 * the instant one hour later; for a repeated time it returns the first one.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const local = dateToUtcMs(date) + (hh * 60 + mm) * 60_000;
  const first = local - offsetAt(local, timeZone);
  const second = local - offsetAt(first, timeZone);
  // Ambiguous (fall back): prefer the earlier instant if it also reads as `local`.
  const earlier = Math.min(first, second);
  return new Date(utcToZonedMs(earlier, timeZone) === local ? earlier : Math.max(first, second));
}

function utcToZonedMs(instant: number, timeZone: string): number {
  return instant + offsetAt(instant, timeZone);
}

/** The local date and time of `instant` in `timeZone`. */
export function utcToZoned(instant: Date, timeZone: string): { date: string; time: string } {
  const p = partsIn(instant.getTime(), timeZone);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return {
    date: `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Today's date in `timeZone`. */
export function todayIn(timeZone: string, now = new Date()): string {
  return utcToZoned(now, timeZone).date;
}
