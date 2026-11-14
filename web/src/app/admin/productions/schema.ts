import {
  PRODUCTION_STATUSES,
  WORK_TYPES,
  isIsoDate,
  normalizeTitle,
  TIME_24H,
} from '@curtainly/shared';
import { z } from 'zod';
import { idField, slugField, UUID_PATTERN, urlField } from '@/lib/fields';
import { formatDate, formatTime } from '@/lib/dates';
import { MAX_PERFORMANCES, slotKey, sortRows } from './performances';

const PERFORMANCES_UNREADABLE = 'Performances could not be read. Reload and try again.';

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((s) => s === '' || isIsoDate(s), `${label} must be a date`);

/** "$1,250" → "1250.00"; blank → null. Stored as numeric(8, 2). */
const priceField = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const s = raw.replace(/[$,\s]/g, '');
    if (s === '') return null;
    const n = Number(s);
    if (!/^\d+(\.\d{1,2})?$/.test(s) || !Number.isFinite(n) || n > 99_999) {
      ctx.addIssue({ code: 'custom', message: 'Enter dollars, like 25 or 42.50' });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

const runtimeField = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === '') return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 1 || n > 600) {
      ctx.addIssue({ code: 'custom', message: 'Minutes, from 1 to 600' });
      return z.NEVER;
    }
    return n;
  });

const rowSchema = z.object({
  date: z.string().default(''),
  time: z.string().default(''),
  venueId: z.string().default(''),
  notes: z.string().default(''),
});

export type ParsedPerformance = {
  date: string;
  time: string;
  venueId: string | null;
  notes: string | null;
};

/** The editor posts every row as JSON in one hidden `performances` field. */
const performancesField = z.string().transform((raw, ctx): ParsedPerformance[] => {
  let json: unknown = [];
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: 'custom', message: PERFORMANCES_UNREADABLE });
      return z.NEVER;
    }
  }
  const parsed = z.array(rowSchema).safeParse(json);
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: PERFORMANCES_UNREADABLE });
    return z.NEVER;
  }
  // Rows left completely empty are dropped.
  const rows = parsed.data
    .map((r) => ({ ...r, date: r.date.trim(), time: r.time.trim(), notes: r.notes.trim() }))
    .filter((r) => r.date || r.time || r.notes);
  if (rows.length > MAX_PERFORMANCES) {
    ctx.addIssue({ code: 'custom', message: `Keep it to ${MAX_PERFORMANCES} performances` });
    return z.NEVER;
  }

  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const where = `Performance ${i + 1}`;
    const problem = !isIsoDate(r.date)
      ? `${where} needs a date`
      : !TIME_24H.test(r.time)
        ? `${where} (${formatDate(r.date)}) needs a time`
        : r.venueId && !UUID_PATTERN.test(r.venueId)
          ? `${where} has an unknown venue`
          : r.notes.length > 200
            ? `Keep notes under 200 characters (performance ${i + 1})`
            : seen.has(slotKey(r.date, r.time))
              ? `${formatDate(r.date)} at ${formatTime(r.time)} is listed twice`
              : undefined;
    if (problem) {
      ctx.addIssue({ code: 'custom', message: problem });
      return z.NEVER;
    }
    seen.add(slotKey(r.date, r.time));
  }

  return sortRows(rows).map((r) => ({
    date: r.date,
    time: r.time,
    venueId: r.venueId || null,
    notes: r.notes || null,
  }));
});

export const productionFormSchema = z
  .object({
    /** An existing Work, or blank when creating a new one from `newWorkTitle`. */
    workId: z.string().trim().default(''),
    newWorkTitle: z.string().trim().max(200, 'Keep it under 200 characters').default(''),
    newWorkType: z.enum(WORK_TYPES).optional().catch(undefined),
    /** Set to the normalized title once the admin has seen matching Works and wants a new one anyway. */
    confirmNewWork: z.string().default(''),
    companyId: idField('Pick a company'),
    venueId: idField('Pick a venue'),
    slug: slugField,
    startDate: optionalDate('Start'),
    endDate: optionalDate('End'),
    priceMin: priceField,
    priceMax: priceField,
    ticketUrl: urlField('Enter a ticket link like tickets.example.org/show'),
    advisory: z
      .string()
      .trim()
      .max(500, 'Keep it under 500 characters')
      .transform((s) => s || null),
    runtimeMin: runtimeField,
    familyFriendly: z
      .string()
      .optional()
      .transform((v) => v === 'on' || v === 'true'),
    status: z.enum(PRODUCTION_STATUSES, { error: 'Pick a status' }),
    performances: performancesField.default([]),
    /** "Edit then approve": the review item this save approves. */
    reviewItemId: z
      .string()
      .trim()
      .default('')
      .refine((s) => s === '' || UUID_PATTERN.test(s), 'Unknown review item'),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (p.workId) {
      if (!UUID_PATTERN.test(p.workId)) issue('workId', 'Pick a work from the list');
    } else if (!p.newWorkTitle) {
      issue('workId', 'Pick a work, or create a new one');
    } else {
      if (!normalizeTitle(p.newWorkTitle)) issue('workId', 'The title needs letters or numbers');
      if (!p.newWorkType) issue('workId', 'Pick a type for the new work');
    }

    if (p.priceMin && p.priceMax && Number(p.priceMin) > Number(p.priceMax)) {
      issue('priceMax', 'The highest price is below the lowest');
    }

    const first = p.performances[0]?.date;
    const last = p.performances.at(-1)?.date;
    if (!p.startDate && !first) issue('startDate', 'Enter the first date, or add performances');
    if (!p.endDate && !last) issue('endDate', 'Enter the last date, or add performances');
    const start = p.startDate || first;
    const end = p.endDate || last;
    if (start && end && end < start) issue('endDate', 'The end is before the start');
    if (p.startDate && first && first < p.startDate) {
      issue('startDate', `There's a performance on ${formatDate(first)}, before this date`);
    }
    if (p.endDate && last && last > p.endDate) {
      issue('endDate', `There's a performance on ${formatDate(last)}, after this date`);
    }

    if (p.status === 'published' && p.performances.length === 0) {
      issue('status', 'Add at least one performance before publishing');
    }
  })
  .transform((p) => ({
    ...p,
    // Blank dates come from the first and last performance.
    startDate: p.startDate || p.performances[0]!.date,
    endDate: p.endDate || p.performances.at(-1)!.date,
  }));

export type ProductionFormInput = z.output<typeof productionFormSchema>;
