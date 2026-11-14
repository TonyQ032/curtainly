import 'server-only';
import { titleHasKeyword } from '@curtainly/shared';
import type { DbExecutor } from '@curtainly/shared/db/apply-diff';
import { filterRules, reviewItems } from '@curtainly/shared/db/schema';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { parseProposed } from '../review/review-item';

/**
 * Add a rule. `exists` when that scope already has the keyword; `global` when
 * a source rule would repeat a global one (not added: it would change nothing).
 */
export async function addFilterRule(
  tx: DbExecutor,
  rule: {
    sourceId: string | null;
    keyword: string;
    createdBy: string;
    reviewItemId?: string;
  },
): Promise<'added' | 'exists' | 'global'> {
  if (rule.sourceId) {
    const [global] = await tx
      .select({ id: filterRules.id })
      .from(filterRules)
      .where(and(isNull(filterRules.sourceId), eq(filterRules.keyword, rule.keyword)))
      .limit(1);
    if (global) return 'global';
  }
  const rows = await tx
    .insert(filterRules)
    .values(rule)
    .onConflictDoNothing({ target: [filterRules.sourceId, filterRules.keyword] })
    .returning({ id: filterRules.id });
  return rows.length > 0 ? 'added' : 'exists';
}

/**
 * Close pending ingested items the new rule would have filtered, as "not a
 * show": filtered candidates are never queued, so the runner wouldn't touch
 * them again and they'd sit in the queue for good. Returns how many closed.
 */
export async function closeMatchingPending(
  tx: DbExecutor,
  rule: { sourceId: string | null; keyword: string },
  reviewer: string,
): Promise<number> {
  const pending = await tx
    .select({ id: reviewItems.id, proposed: reviewItems.proposed })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.status, 'pending'),
        isNotNull(reviewItems.candidateKey),
        rule.sourceId ? eq(reviewItems.sourceId, rule.sourceId) : isNotNull(reviewItems.sourceId),
      ),
    );
  const ids = pending
    .filter((item) => {
      const title = parseProposed(item.proposed)?.title;
      return title !== undefined && titleHasKeyword(title, rule.keyword);
    })
    .map((item) => item.id);
  if (ids.length === 0) return 0;
  const closed = await tx
    .update(reviewItems)
    .set({ status: 'not_a_show', reviewer, reviewedAt: new Date() })
    .where(and(inArray(reviewItems.id, ids), eq(reviewItems.status, 'pending')))
    .returning({ id: reviewItems.id });
  return closed.length;
}
