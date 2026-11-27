import 'server-only';
import { and, count, eq, gt, inArray, isNull, max, min, or, sql } from 'drizzle-orm';
import {
  AUTO_REVIEWER,
  autoApproveEligibility,
  EMPTY_STREAK,
  type AutoApproveEligibility,
} from '@curtainly/shared';
import { reviewItems } from '@curtainly/shared/db/schema';
import { db } from '@/lib/db';

/** Reviewed items that break a source's auto-approve streak. */
const isBreak = or(
  inArray(reviewItems.status, ['rejected', 'merged']),
  and(eq(reviewItems.status, 'approved'), eq(reviewItems.edited, true)),
);

/**
 * Each source's auto-approve eligibility (see `@curtainly/shared` auto-approve):
 * clean approvals since its last break. Sources with no reviewed items get an
 * empty streak.
 */
export async function loadEligibility(
  sourceIds: string[],
): Promise<Map<string, AutoApproveEligibility>> {
  const result = new Map(sourceIds.map((id) => [id, autoApproveEligibility(EMPTY_STREAK)]));
  if (sourceIds.length === 0) return result;

  const forSources = inArray(reviewItems.sourceId, sourceIds);
  const breaks = db()
    .select({
      sourceId: reviewItems.sourceId,
      brokenAt: max(reviewItems.reviewedAt).as('broken_at'),
    })
    .from(reviewItems)
    .where(and(forSources, isBreak))
    .groupBy(reviewItems.sourceId)
    .as('breaks');

  const [breakRows, cleanRows] = await Promise.all([
    db().select().from(breaks),
    db()
      .select({
        sourceId: reviewItems.sourceId,
        clean: count(),
        firstAt: min(reviewItems.createdAt),
        lastAt: max(reviewItems.createdAt),
      })
      .from(reviewItems)
      .leftJoin(breaks, eq(breaks.sourceId, reviewItems.sourceId))
      .where(
        and(
          forSources,
          eq(reviewItems.status, 'approved'),
          eq(reviewItems.edited, false),
          sql`${reviewItems.reviewer} is distinct from ${AUTO_REVIEWER}`,
          or(isNull(breaks.brokenAt), gt(reviewItems.reviewedAt, breaks.brokenAt)),
        ),
      )
      .groupBy(reviewItems.sourceId),
  ]);

  // Aliased subquery columns can come back as strings, so normalize to Date.
  const brokenAt = new Map(
    breakRows.map((r) => [r.sourceId, r.brokenAt ? new Date(r.brokenAt) : null]),
  );
  for (const id of sourceIds) {
    const clean = cleanRows.find((r) => r.sourceId === id);
    result.set(
      id,
      autoApproveEligibility({
        clean: clean?.clean ?? 0,
        firstAt: clean?.firstAt ?? null,
        lastAt: clean?.lastAt ?? null,
        brokenAt: brokenAt.get(id) ?? null,
      }),
    );
  }
  return result;
}

export async function loadSourceEligibility(sourceId: string) {
  return (await loadEligibility([sourceId])).get(sourceId)!;
}
