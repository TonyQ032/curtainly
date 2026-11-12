import { CREDIT_ROLES, WORK_TYPES, normalizeTitle, type CreditRole } from '@curtainly/shared';
import type { WorkAuthors } from '@curtainly/shared/db/schema';
import { z } from 'zod';
import { slugField } from '@/lib/fields';

/**
 * One row of the credits editor. The form posts all rows as JSON in one hidden
 * `authors` field; `names` is a comma-separated list.
 */
export type CreditRow = { role: CreditRole | 'other'; customRole: string; names: string };

export const MAX_ALT_TITLES = 20;
export const MAX_CREDIT_ROWS = 20;

const creditRowSchema = z.object({
  role: z.enum([...CREDIT_ROLES, 'other']),
  customRole: z.string().default(''),
  names: z.string().default(''),
});

/** "A, B ,, a" → ["A", "B"] (trimmed, blanks and case-insensitive repeats dropped). */
export function splitList(raw: string, separator: string | RegExp): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(separator)) {
    const item = part.trim().replace(/\s+/g, ' ');
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Turn editor rows into stored credits. Rows for the same role are merged. */
export function rowsToAuthors(rows: CreditRow[]): WorkAuthors {
  const authors: WorkAuthors = {};
  for (const row of rows) {
    const names = splitList(row.names, ',');
    if (names.length === 0) continue;
    if (row.role === 'other') {
      const role = row.customRole.trim().replace(/\s+/g, ' ');
      const other = (authors.other ??= []);
      const existing = other.find((o) => o.role.toLowerCase() === role.toLowerCase());
      if (existing) existing.names = splitList([...existing.names, ...names].join(','), ',');
      else other.push({ role, names });
    } else {
      authors[row.role] = splitList([...(authors[row.role] ?? []), ...names].join(','), ',');
    }
  }
  return authors;
}

/** Stored credits → editor rows, standard roles first. */
export function authorsToRows(authors: WorkAuthors | null | undefined): CreditRow[] {
  const rows: CreditRow[] = [];
  for (const role of CREDIT_ROLES) {
    const names = authors?.[role];
    if (names?.length) rows.push({ role, customRole: '', names: names.join(', ') });
  }
  for (const o of authors?.other ?? []) {
    rows.push({ role: 'other', customRole: o.role, names: o.names.join(', ') });
  }
  return rows;
}

const authorsField = z.string().transform((raw, ctx): WorkAuthors => {
  let json: unknown = [];
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Credits could not be read. Reload and try again.' });
      return z.NEVER;
    }
  }
  const rows = z.array(creditRowSchema).safeParse(json);
  if (!rows.success) {
    ctx.addIssue({ code: 'custom', message: 'Credits could not be read. Reload and try again.' });
    return z.NEVER;
  }
  if (rows.data.length > MAX_CREDIT_ROWS) {
    ctx.addIssue({ code: 'custom', message: `Keep it to ${MAX_CREDIT_ROWS} credits` });
    return z.NEVER;
  }
  for (const row of rows.data) {
    const names = splitList(row.names, ',');
    if (names.length === 0) continue;
    if (row.role === 'other' && !row.customRole.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Name the role for each “Other” credit' });
      return z.NEVER;
    }
    if (row.customRole.length > 80 || names.some((n) => n.length > 120)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Keep roles under 80 and names under 120 characters',
      });
      return z.NEVER;
    }
  }
  return rowsToAuthors(rows.data);
});

const altTitlesField = z
  .string()
  .transform((raw) => splitList(raw, /\r?\n/))
  .refine((list) => list.length <= MAX_ALT_TITLES, `Keep it to ${MAX_ALT_TITLES} alt titles`)
  .refine((list) => list.every((t) => t.length <= 200), 'Keep each alt title under 200 characters');

export const workFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(200, 'Keep it under 200 characters')
      .refine((t) => normalizeTitle(t) !== '', 'The title needs letters or numbers'),
    slug: slugField,
    type: z.enum(WORK_TYPES, { error: 'Pick a type' }),
    altTitles: altTitlesField.default([]),
    authors: authorsField.default({}),
    /** Set to `duplicateKey(...)` once the admin has seen and accepted a duplicate warning. */
    confirmDuplicate: z.string().default(''),
  })
  .transform((w) => ({
    ...w,
    // The title itself isn't an alternative.
    altTitles: w.altTitles.filter((t) => t.toLowerCase() !== w.title.toLowerCase()),
  }));

export type WorkFormInput = z.output<typeof workFormSchema>;

/** Normalized forms of the title and alt titles, used to look for existing Works. */
export function titleKeys(title: string, altTitles: string[]): string[] {
  return [...new Set([title, ...altTitles].map(normalizeTitle).filter(Boolean))];
}

/** Identifies the set of titles a duplicate warning was shown for. */
export function duplicateKey(keys: string[]): string {
  return [...keys].sort().join('|');
}
