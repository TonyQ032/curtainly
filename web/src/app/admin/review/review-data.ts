import 'server-only';
import {
  suggestWorks,
  type DedupProduction,
  type ReviewStatus,
  type WorkMatch,
} from '@curtainly/shared';
import type { DbExecutor } from '@curtainly/shared/db/apply-diff';
import {
  companies,
  performances,
  productions,
  regions,
  reviewItems,
  sources,
  venues,
  works,
} from '@curtainly/shared/db/schema';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/fields';
import type { ProductionFormValues } from '../productions/production-form';
import {
  isKnownTitle,
  matchVenue,
  parseProposed,
  performanceRows,
  preselectedWork,
  priceText,
  proposedInstants,
} from './review-item';

/** A ReviewItem with what the detail page and actions need around it. */
export async function loadReviewItem(id: string) {
  if (!isUuid(id)) return undefined;
  const [row] = await db()
    .select({
      item: reviewItems,
      source: { id: sources.id, kind: sources.kind, companyId: sources.companyId },
    })
    .from(reviewItems)
    .leftJoin(sources, eq(reviewItems.sourceId, sources.id))
    .where(eq(reviewItems.id, id))
    .limit(1);
  if (!row) return undefined;

  const proposed = parseProposed(row.item.proposed);
  const companyId = proposed?.companyId ?? row.source?.companyId;
  const [company] =
    companyId && isUuid(companyId)
      ? await db()
          .select({
            id: companies.id,
            name: companies.name,
            inScope: companies.inScope,
            regionId: companies.regionId,
            timezone: regions.timezone,
          })
          .from(companies)
          .innerJoin(regions, eq(companies.regionId, regions.id))
          .where(eq(companies.id, companyId))
          .limit(1)
      : [];

  return { ...row, proposed, company };
}

export type LoadedReviewItem = NonNullable<Awaited<ReturnType<typeof loadReviewItem>>>;

/**
 * Work suggestions for a pending new item, computed now rather than read from
 * the item: Works created since the run (often while reviewing the queue)
 * should show up. Reviewed items and updates keep what was stored.
 */
export async function workSuggestions(row: LoadedReviewItem): Promise<WorkMatch[]> {
  const { item, proposed } = row;
  if (item.status !== 'pending' || item.productionId || !proposed) return item.matchSuggestions;
  const all = await db()
    .select({
      id: works.id,
      title: works.title,
      normalizedTitle: works.normalizedTitle,
      altTitles: works.altTitles,
    })
    .from(works);
  return suggestWorks(proposed.title, all);
}

/** A production as dedup sees it (Work titles, venue timezone, performances). */
export async function loadDedupProduction(
  tx: DbExecutor,
  id: string,
): Promise<DedupProduction | undefined> {
  const [row] = await tx
    .select({
      id: productions.id,
      companyId: productions.companyId,
      workId: productions.workId,
      workNormalizedTitle: works.normalizedTitle,
      workAltTitles: works.altTitles,
      startDate: productions.startDate,
      endDate: productions.endDate,
      timeZone: regions.timezone,
      priceMin: productions.priceMin,
      priceMax: productions.priceMax,
      ticketUrl: productions.ticketUrl,
      advisory: productions.advisory,
      runtimeMin: productions.runtimeMin,
    })
    .from(productions)
    .innerJoin(works, eq(productions.workId, works.id))
    .innerJoin(venues, eq(productions.venueId, venues.id))
    .innerJoin(regions, eq(venues.regionId, regions.id))
    .where(eq(productions.id, id))
    .limit(1);
  if (!row) return undefined;
  const perfs = await tx
    .select({ startsAt: performances.startsAt })
    .from(performances)
    .where(eq(performances.productionId, id))
    .orderBy(asc(performances.startsAt));
  return { ...row, performances: perfs.map((p) => p.startsAt) };
}

/** Thrown inside a transaction when the item was reviewed meanwhile, to roll it back. */
export class AlreadyReviewedError extends Error {
  constructor() {
    super('This item was already reviewed.');
  }
}

/**
 * Close a pending item with the reviewer and time. Throws AlreadyReviewedError
 * (rolling back the caller's transaction) if it isn't pending any more.
 */
export async function closeReviewItem(
  tx: DbExecutor,
  id: string,
  close: {
    status: Exclude<ReviewStatus, 'pending'>;
    reviewer: string;
    productionId?: string;
    rejectReason?: string;
  },
): Promise<void> {
  const rows = await tx
    .update(reviewItems)
    .set({ ...close, reviewedAt: new Date() })
    .where(and(eq(reviewItems.id, id), eq(reviewItems.status, 'pending')))
    .returning({ id: reviewItems.id });
  if (rows.length === 0) throw new AlreadyReviewedError();
}

/**
 * Add the source's title to the Work's alt titles when it isn't already one
 * of its names, so the next run matches this production instead of queueing
 * the show as new again.
 */
export async function learnAltTitle(tx: DbExecutor, workId: string, title: string) {
  const [work] = await tx
    .select({ normalizedTitle: works.normalizedTitle, altTitles: works.altTitles })
    .from(works)
    .where(eq(works.id, workId))
    .limit(1);
  if (!work || isKnownTitle(title, work)) return;
  await tx
    .update(works)
    .set({ altTitles: [...work.altTitles, title.trim()] })
    .where(eq(works.id, workId));
}

/** The newest other pending item, to review next. */
export async function nextPendingItem(exceptId: string): Promise<string | undefined> {
  const [next] = await db()
    .select({ id: reviewItems.id })
    .from(reviewItems)
    .where(and(eq(reviewItems.status, 'pending'), ne(reviewItems.id, exceptId)))
    .orderBy(desc(reviewItems.createdAt))
    .limit(1);
  return next?.id;
}

/**
 * Production form values for "edit then approve" of a new item: the proposal,
 * with the Work and venue preselected the way the approve form does.
 */
export async function newProductionPrefill(
  row: LoadedReviewItem,
): Promise<Partial<ProductionFormValues> | undefined> {
  const { item, proposed, company } = row;
  if (item.status !== 'pending' || item.productionId || !proposed || !company) return undefined;

  const pick = preselectedWork(await workSuggestions(row));
  const [[work], venueRows, [usual]] = await Promise.all([
    pick
      ? db()
          .select({ id: works.id, title: works.title, type: works.type })
          .from(works)
          .where(eq(works.id, pick.workId))
          .limit(1)
      : Promise.resolve([]),
    db()
      .select({
        id: venues.id,
        name: venues.name,
        regionId: venues.regionId,
        timezone: regions.timezone,
      })
      .from(venues)
      .innerJoin(regions, eq(venues.regionId, regions.id)),
    db()
      .select({ venueId: productions.venueId })
      .from(productions)
      .where(eq(productions.companyId, company.id))
      .orderBy(desc(productions.startDate))
      .limit(1),
  ]);
  const venueId = matchVenue(proposed.venueName, venueRows, {
    regionId: company.regionId,
    usualVenueId: usual?.venueId,
  });
  const timeZone = venueRows.find((v) => v.id === venueId)?.timezone ?? company.timezone;
  const instants = proposedInstants(proposed);

  return {
    workId: work?.id ?? '',
    workLabel: work ? JSON.stringify(work) : '',
    newWorkTitle: work ? '' : proposed.title,
    companyId: company.id,
    venueId: venueId ?? '',
    priceMin: priceText(proposed.priceMin),
    priceMax: priceText(proposed.priceMax),
    ticketUrl: proposed.ticketUrl ?? '',
    advisory: proposed.advisory ?? '',
    runtimeMin: proposed.runtimeMin?.toString() ?? '',
    status: company.inScope && instants.length > 0 ? 'published' : 'draft',
    performances: JSON.stringify(performanceRows(instants, timeZone)),
    reviewItemId: item.id,
  };
}

/** The pending update item for this production, if `reviewId` names one. */
export async function pendingUpdate(reviewId: string | undefined, productionId: string) {
  if (!reviewId) return undefined;
  const row = await loadReviewItem(reviewId);
  if (!row || row.item.status !== 'pending' || row.item.productionId !== productionId) {
    return undefined;
  }
  return row.item.diff ? { id: row.item.id, diff: row.item.diff } : undefined;
}
