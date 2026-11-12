/**
 * Dedup and update diffs for ingested candidates. See docs/PLAN.md → "Duplicate
 * and identity rules" and DECISIONS.md (2026-11-12, #22).
 *
 * Same production = same company + same Work + overlapping dates. A candidate
 * that matches an existing production becomes an update (a diff of upcoming
 * performances and changed facts) or, when nothing changed, nothing at all.
 *
 * Pure functions: the caller loads the company's productions (`DedupProduction`)
 * once per source and passes them in.
 */
import { normalizeTitle } from './normalize';
import { utcToZoned } from './local-time';

/** The candidate fields dedup and diffing read (ingest's CandidateProduction fits). */
export type DedupCandidate = {
  title: string;
  companyId: string;
  performances: readonly { startsAt: string }[];
  priceMin?: number;
  priceMax?: number;
  ticketUrl?: string;
  advisory?: string;
  runtimeMin?: number;
};

/** An existing production with what dedup needs from its Work, venue Region and performances. */
export type DedupProduction = {
  id: string;
  companyId: string;
  workId: string;
  /** The Work's `normalized_title`. */
  workNormalizedTitle: string;
  workAltTitles: readonly string[];
  /** ISO dates, local to `timeZone`. */
  startDate: string;
  endDate: string;
  /** IANA zone of the production venue's Region. */
  timeZone: string;
  /** `numeric` columns come back from Postgres as strings. */
  priceMin: string | number | null;
  priceMax: string | number | null;
  ticketUrl: string | null;
  advisory: string | null;
  runtimeMin: number | null;
  performances: readonly Date[];
};

export const DIFF_FIELDS = ['priceMin', 'priceMax', 'ticketUrl', 'advisory', 'runtimeMin'] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];

export type FieldChange = {
  field: DiffField;
  from: string | number | null;
  to: string | number;
};

/** Stored on `review_items.diff` for updates. Times are UTC ISO strings. */
export type ProductionDiff = {
  performances: { added: string[]; removed: string[] };
  fields: FieldChange[];
  /** Present when the candidate's performances run outside the production's dates. */
  dates?: {
    from: { startDate: string; endDate: string };
    to: { startDate: string; endDate: string };
  };
};

export type DedupResult =
  | { kind: 'new' }
  | { kind: 'update'; productionId: string; diff: ProductionDiff }
  | { kind: 'unchanged'; productionId: string };

/** Valid performance instants of a candidate, sorted and without duplicates. */
function candidateInstants(candidate: DedupCandidate): Date[] {
  const ms = new Set<number>();
  for (const p of candidate.performances) {
    const t = new Date(p.startsAt).getTime();
    if (!Number.isNaN(t)) ms.add(t);
  }
  return [...ms].sort((a, b) => a - b).map((t) => new Date(t));
}

/** First and last local date of `instants` (sorted) in `timeZone`. */
function localRange(instants: readonly Date[], timeZone: string) {
  return {
    startDate: utcToZoned(instants[0]!, timeZone).date,
    endDate: utcToZoned(instants[instants.length - 1]!, timeZone).date,
  };
}

function isSameWork(normalizedTitle: string, production: DedupProduction): boolean {
  if (production.workNormalizedTitle === normalizedTitle) return true;
  return production.workAltTitles.some((alt) => normalizeTitle(alt) === normalizedTitle);
}

/** Days two inclusive ISO date ranges share (0 when they don't overlap). */
function overlapDays(a: { startDate: string; endDate: string }, b: typeof a): number {
  const start = a.startDate > b.startDate ? a.startDate : b.startDate;
  const end = a.endDate < b.endDate ? a.endDate : b.endDate;
  if (start > end) return 0;
  return (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
}

/**
 * The existing production a candidate refers to: same company, a Work whose
 * normalized title or alt title equals the candidate's normalized title, and a
 * date range overlapping the candidate's performances (in the production's
 * timezone). With several, the one sharing the most days wins, then the
 * earliest start. A candidate without performances never matches.
 */
export function findExistingProduction(
  candidate: DedupCandidate,
  productions: readonly DedupProduction[],
): DedupProduction | undefined {
  const instants = candidateInstants(candidate);
  if (instants.length === 0) return undefined;
  const title = normalizeTitle(candidate.title);
  if (!title) return undefined;

  let best: { production: DedupProduction; days: number } | undefined;
  for (const production of productions) {
    if (production.companyId !== candidate.companyId) continue;
    if (!isSameWork(title, production)) continue;
    const days = overlapDays(localRange(instants, production.timeZone), production);
    if (days === 0) continue;
    if (
      !best ||
      days > best.days ||
      (days === best.days && production.startDate < best.production.startDate)
    ) {
      best = { production, days };
    }
  }
  return best?.production;
}

function sameValue(field: DiffField, from: string | number | null, to: string | number) {
  if (from === null) return false;
  if (field === 'priceMin' || field === 'priceMax') return Number(from) === Number(to);
  return from === to;
}

/**
 * What re-ingesting `candidate` would change on `production`.
 *
 * - Performances: only upcoming ones (at or after `now`) are compared, because
 *   sources drop past performances from their listings.
 * - Fields: a value the candidate leaves out is never proposed as cleared;
 *   sources often omit fields they once had.
 * - Dates: proposed only when performances run outside the production's dates.
 * - Venue isn't compared: source venue names rarely match ours word for word,
 *   and a noisy diff would queue every run.
 */
export function diffProduction(
  production: DedupProduction,
  candidate: DedupCandidate,
  now: Date,
): ProductionDiff {
  const cutoff = now.getTime();
  const instants = candidateInstants(candidate);
  const incoming = new Set(instants.map((d) => d.getTime()));
  const existing = new Set(production.performances.map((d) => d.getTime()));

  const added = [...incoming].filter((t) => t >= cutoff && !existing.has(t));
  const removed = [...existing].filter((t) => t >= cutoff && !incoming.has(t));
  const iso = (ts: number[]) => ts.sort((a, b) => a - b).map((t) => new Date(t).toISOString());

  const fields: FieldChange[] = [];
  for (const field of DIFF_FIELDS) {
    let to = candidate[field];
    if (typeof to === 'string') to = to.trim();
    if (to === undefined || to === '' || (typeof to === 'number' && !Number.isFinite(to))) continue;
    const from = production[field];
    if (!sameValue(field, from, to)) fields.push({ field, from, to });
  }

  const diff: ProductionDiff = {
    performances: { added: iso(added), removed: iso(removed) },
    fields,
  };

  if (instants.length > 0) {
    const range = localRange(instants, production.timeZone);
    const to = {
      startDate: range.startDate < production.startDate ? range.startDate : production.startDate,
      endDate: range.endDate > production.endDate ? range.endDate : production.endDate,
    };
    if (to.startDate !== production.startDate || to.endDate !== production.endDate) {
      diff.dates = {
        from: { startDate: production.startDate, endDate: production.endDate },
        to,
      };
    }
  }
  return diff;
}

export function isEmptyDiff(diff: ProductionDiff): boolean {
  return (
    diff.performances.added.length === 0 &&
    diff.performances.removed.length === 0 &&
    diff.fields.length === 0 &&
    !diff.dates
  );
}

/**
 * Classify a candidate: a new production, an update to an existing one (with
 * its diff), or unchanged. Unchanged candidates must not create a ReviewItem.
 */
export function dedupCandidate(
  candidate: DedupCandidate,
  productions: readonly DedupProduction[],
  now: Date,
): DedupResult {
  const existing = findExistingProduction(candidate, productions);
  if (!existing) return { kind: 'new' };
  const diff = diffProduction(existing, candidate, now);
  return isEmptyDiff(diff)
    ? { kind: 'unchanged', productionId: existing.id }
    : { kind: 'update', productionId: existing.id, diff };
}
