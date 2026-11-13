/**
 * Apply a `ProductionDiff` (see production-diff.ts) to a stored production.
 * Used by auto-approval in ingest (#23) and by approving an update in the
 * review queue (#25), so both publish an update the same way.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { ProductionDiff } from '../production-diff';
import type { Db } from './index';
import { performances, productions } from './schema';

/** A client or an open transaction. */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Add and remove performances, set changed fields and widen the run dates.
 * Call it inside a transaction. Adding a performance that already exists and
 * removing one that's gone are no-ops, so applying a diff twice is harmless.
 */
export async function applyProductionDiff(
  db: DbExecutor,
  productionId: string,
  diff: ProductionDiff,
): Promise<void> {
  const { added, removed } = diff.performances;
  if (removed.length > 0) {
    await db.delete(performances).where(
      and(
        eq(performances.productionId, productionId),
        inArray(
          performances.startsAt,
          removed.map((t) => new Date(t)),
        ),
      ),
    );
  }
  if (added.length > 0) {
    await db
      .insert(performances)
      .values(added.map((t) => ({ productionId, startsAt: new Date(t) })))
      .onConflictDoNothing({ target: [performances.productionId, performances.startsAt] });
  }

  const set: Partial<typeof productions.$inferInsert> = {};
  for (const change of diff.fields) {
    switch (change.field) {
      case 'runtimeMin':
        set.runtimeMin = Number(change.to);
        break;
      default:
        // numeric columns take strings; ticketUrl and advisory are text.
        set[change.field] = String(change.to);
    }
  }
  if (diff.dates) {
    set.startDate = diff.dates.to.startDate;
    set.endDate = diff.dates.to.endDate;
  }
  // Always touch updated_at so the production shows it changed, even for performance-only diffs.
  await db
    .update(productions)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(productions.id, productionId));
}
