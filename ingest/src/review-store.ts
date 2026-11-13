import { applyProductionDiff, type DbExecutor } from '@curtainly/shared/db/apply-diff';
import type { Db } from '@curtainly/shared/db';
import { reviewItems, works } from '@curtainly/shared/db/schema';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import type { QueueCounts, QueueEntry, ReviewQueueStore } from './review-queue';

/** `review_items.reviewer` for updates published by an auto-approve source. */
export const AUTO_REVIEWER = 'auto-approve';

const isPending = sql`${reviewItems.status} = 'pending'`;

function content(entry: QueueEntry) {
  return {
    productionId: entry.productionId,
    payload: entry.payload,
    proposed: entry.proposed,
    diff: entry.diff,
    matchSuggestions: entry.matchSuggestions,
  };
}

/** Delete this source's other pending items for the production: the entry supersedes them. */
async function clearSuperseded(db: DbExecutor, sourceId: string, entry: QueueEntry) {
  if (!entry.productionId) return 0;
  const rows = await db
    .delete(reviewItems)
    .where(
      and(
        eq(reviewItems.sourceId, sourceId),
        eq(reviewItems.productionId, entry.productionId),
        ne(reviewItems.candidateKey, entry.key),
        isPending,
      ),
    )
    .returning({ id: reviewItems.id });
  return rows.length;
}

/** ReviewQueueStore backed by `review_items`. */
export function dbReviewQueue(db: Db): ReviewQueueStore {
  return {
    async loadWorks() {
      return db
        .select({
          id: works.id,
          title: works.title,
          normalizedTitle: works.normalizedTitle,
          altTitles: works.altTitles,
        })
        .from(works);
    },

    async write(source, plan, now) {
      const counts: QueueCounts = { created: 0, updated: 0, autoApproved: 0, cleared: 0 };

      for (const entry of plan.entries) {
        if (entry.kind === 'update' && entry.diff && entry.productionId && source.autoApprove) {
          const { productionId, diff } = entry;
          await db.transaction(async (tx) => {
            await applyProductionDiff(tx, productionId, diff);
            // Log it: the pending item for this key (if any) becomes the approved record.
            const approved = {
              ...content(entry),
              status: 'approved' as const,
              reviewer: AUTO_REVIEWER,
              reviewedAt: now,
            };
            const promoted = await tx
              .update(reviewItems)
              .set(approved)
              .where(
                and(
                  eq(reviewItems.sourceId, source.id),
                  eq(reviewItems.candidateKey, entry.key),
                  isPending,
                ),
              )
              .returning({ id: reviewItems.id });
            if (promoted.length === 0) {
              await tx
                .insert(reviewItems)
                .values({ ...approved, sourceId: source.id, candidateKey: entry.key });
            }
            counts.cleared += await clearSuperseded(tx, source.id, entry);
          });
          counts.autoApproved++;
          continue;
        }

        // One pending item per (source, key). Rewrite it only when what the
        // reviewer sees changed; a payload-only change (e.g. seats left) is ignored.
        const rows = await db
          .insert(reviewItems)
          .values({ ...content(entry), sourceId: source.id, candidateKey: entry.key })
          .onConflictDoUpdate({
            target: [reviewItems.sourceId, reviewItems.candidateKey],
            targetWhere: isPending,
            set: {
              productionId: sql`excluded.production_id`,
              payload: sql`excluded.payload`,
              proposed: sql`excluded.proposed`,
              diff: sql`excluded.diff`,
              matchSuggestions: sql`excluded.match_suggestions`,
              updatedAt: now,
            },
            setWhere: sql`(${reviewItems.productionId}, ${reviewItems.proposed}, ${reviewItems.diff}, ${reviewItems.matchSuggestions})
              is distinct from (excluded.production_id, excluded.proposed, excluded.diff, excluded.match_suggestions)`,
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        const row = rows[0];
        if (row) {
          if (row.inserted) counts.created++;
          else counts.updated++;
        }
        counts.cleared += await clearSuperseded(db, source.id, entry);
      }

      for (const { key, productionId } of plan.unchanged) {
        const rows = await db
          .delete(reviewItems)
          .where(
            and(
              eq(reviewItems.sourceId, source.id),
              or(eq(reviewItems.candidateKey, key), eq(reviewItems.productionId, productionId)),
              isPending,
            ),
          )
          .returning({ id: reviewItems.id });
        counts.cleared += rows.length;
      }
      return counts;
    },
  };
}
