/**
 * Reading a ReviewItem for the detail page and its actions (#25). Pure: no
 * database access, so it is unit-tested and shared by the page, the review
 * actions and the production form's "edit then approve" prefill.
 */
import {
  normalizeTitle,
  utcToZoned,
  WORK_TYPES,
  type ProductionDiff,
  type WorkMatch,
} from '@curtainly/shared';
import { z } from 'zod';
import { UUID_PATTERN } from '@/lib/fields';
import type { PerformanceRow } from '../productions/performances';

/**
 * The proposed production stored in `review_items.proposed`: ingest's
 * CandidateProduction without its raw item. Parsed defensively, since items
 * from other origins (submissions, error reports) may not have this shape.
 */
const proposedSchema = z.object({
  title: z.string(),
  companyId: z.string(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  performances: z.array(z.object({ startsAt: z.string() })).default([]),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  ticketUrl: z.string().optional(),
  advisory: z.string().optional(),
  runtimeMin: z.number().optional(),
});

export type Proposed = z.output<typeof proposedSchema>;

export function parseProposed(value: unknown): Proposed | null {
  const parsed = proposedSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Valid performance instants, sorted, without duplicates. */
export function proposedInstants(proposed: Pick<Proposed, 'performances'>): Date[] {
  const ms = new Set<number>();
  for (const p of proposed.performances) {
    const t = new Date(p.startsAt).getTime();
    if (!Number.isNaN(t)) ms.add(t);
  }
  return [...ms].sort((a, b) => a - b).map((t) => new Date(t));
}

/** Local first and last date of sorted instants, or null when there are none. */
export function localDateRange(instants: readonly Date[], timeZone: string) {
  const first = instants[0];
  const last = instants.at(-1);
  if (!first || !last) return null;
  return {
    startDate: utcToZoned(first, timeZone).date,
    endDate: utcToZoned(last, timeZone).date,
  };
}

/** Performance editor rows (local date and time) for instants. */
export function performanceRows(instants: readonly Date[], timeZone: string): PerformanceRow[] {
  return instants.map((d) => ({ ...utcToZoned(d, timeZone), venueId: '', notes: '' }));
}

/** Matches strong enough to preselect: same normalized title or alt title. */
export function preselectedWork(matches: readonly WorkMatch[]): WorkMatch | undefined {
  const top = matches[0];
  return top && (top.kind === 'exact' || top.kind === 'alt_title') ? top : undefined;
}

export type VenueCandidate = { id: string; name: string; regionId: string };

/**
 * The venue a source's venue name most likely means: same normalized name
 * (preferring the company's region), else a name containing the other
 * ("The Old Globe" vs "Old Globe Theatre"), else the company's usual venue.
 */
export function matchVenue(
  venueName: string | undefined,
  venues: readonly VenueCandidate[],
  { regionId, usualVenueId }: { regionId?: string; usualVenueId?: string } = {},
): string | undefined {
  const name = venueName ? normalizeTitle(venueName) : '';
  if (name) {
    const local = (v: VenueCandidate) => (v.regionId === regionId ? 0 : 1);
    const ranked = [...venues].sort((a, b) => local(a) - local(b));
    const exact = ranked.find((v) => normalizeTitle(v.name) === name);
    if (exact) return exact.id;
    const contains = ranked.find((v) => {
      const other = normalizeTitle(v.name);
      return (
        other.length >= 4 && name.length >= 4 && (other.includes(name) || name.includes(other))
      );
    });
    if (contains) return contains.id;
  }
  return usualVenueId && venues.some((v) => v.id === usualVenueId) ? usualVenueId : undefined;
}

/** True when `title` is already one of the Work's names, so no alt title needs adding. */
export function isKnownTitle(
  title: string,
  work: { normalizedTitle: string; altTitles: readonly string[] },
): boolean {
  const key = normalizeTitle(title);
  if (!key || key === work.normalizedTitle) return true;
  return work.altTitles.some((alt) => normalizeTitle(alt) === key);
}

/** A diff that only adds: merging a candidate never drops what the production already lists. */
export function additiveDiff(diff: ProductionDiff): ProductionDiff {
  return { ...diff, performances: { added: diff.performances.added, removed: [] } };
}

/** Existing performance rows with an update diff applied, sorted. */
export function applyDiffToRows(
  rows: readonly PerformanceRow[],
  diff: ProductionDiff,
  timeZone: string,
): PerformanceRow[] {
  const key = (r: { date: string; time: string }) => `${r.date} ${r.time}`;
  const removed = new Set(
    diff.performances.removed.map((t) => key(utcToZoned(new Date(t), timeZone))),
  );
  const kept = rows.filter((r) => !removed.has(key(r)));
  const have = new Set(kept.map(key));
  for (const t of diff.performances.added) {
    const local = utcToZoned(new Date(t), timeZone);
    if (!have.has(key(local))) {
      kept.push({ ...local, venueId: '', notes: '' });
      have.add(key(local));
    }
  }
  return kept.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** "25" or "42.50" for a price input; blank for none. */
export function priceText(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toFixed(2).replace(/\.00$/, '');
}

const MATCH_KIND_LABELS: Record<WorkMatch['kind'], string> = {
  exact: 'Same title',
  alt_title: 'Alt title',
  main_title: 'Same main title',
  contains: 'Title contains',
  similar: 'Similar',
};

export function matchKindLabel(kind: WorkMatch['kind']): string {
  return MATCH_KIND_LABELS[kind];
}

/** Approve a new item: the Work (an existing one, or "new" with a title and type), venue, and whether to publish. */
export const approveNewSchema = z
  .object({
    work: z.string().trim().default(''),
    newWorkTitle: z.string().trim().max(200, 'Keep it under 200 characters').default(''),
    newWorkType: z.enum(WORK_TYPES).optional().catch(undefined),
    venueId: z.string().regex(UUID_PATTERN, 'Pick a venue'),
    publish: z
      .string()
      .optional()
      .transform((v) => v === 'on'),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.work === 'new') {
      if (!normalizeTitle(v.newWorkTitle)) issue('newWorkTitle', 'Enter the work’s title');
      if (!v.newWorkType) issue('newWorkType', 'Pick a type for the new work');
    } else if (!UUID_PATTERN.test(v.work)) {
      issue('work', 'Pick a work, or create a new one');
    }
  });

export const mergeSchema = z.object({
  productionId: z.string().regex(UUID_PATTERN, 'Pick the production to merge into'),
});

export const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Say why, so the next reviewer knows')
    .max(500, 'Keep it under 500 characters'),
});
