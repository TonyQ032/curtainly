import { isIsoDate, TIME_24H, weekday } from '@curtainly/shared';

/** Display formats for local ISO dates (YYYY-MM-DD) and 24-hour times (HH:MM). */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "19:30" → "7:30 PM". */
export function formatTime(time: string): string {
  if (!TIME_24H.test(time)) return time;
  const [h, m] = time.split(':').map(Number) as [number, number];
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03-04" → "Thu, Mar 4, 2027" (or without the year). */
export function formatDate(date: string, { year = true, day = true } = {}): string {
  if (!isIsoDate(date)) return date;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const base = `${MONTHS[m - 1]} ${d}`;
  const withDay = day ? `${WEEKDAY_SHORT[weekday(date)]}, ${base}` : base;
  return year ? `${withDay}, ${y}` : withDay;
}

/** "Mar 4 – Apr 2, 2027", "Dec 5, 2027 – Jan 9, 2028", or a single date. */
export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start, { day: false });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, { day: false, year: !sameYear })} – ${formatDate(end, { day: false })}`;
}
