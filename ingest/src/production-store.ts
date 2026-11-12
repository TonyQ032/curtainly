import type { DedupProduction } from '@curtainly/shared';
import type { Db } from '@curtainly/shared/db';
import { performances, productions, regions, venues, works } from '@curtainly/shared/db/schema';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { ProductionStore } from './run';

/**
 * Productions ending this long ago or later are dedup candidates. Older runs
 * can't overlap anything a source still lists.
 */
const LOOKBACK_DAYS = 365;

/** ProductionStore backed by `productions`, with each one's Work, venue timezone and performances. */
export function dbProductionStore(db: Db): ProductionStore {
  return {
    async loadForCompany(companyId) {
      const rows = await db
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
        .innerJoin(works, eq(works.id, productions.workId))
        .innerJoin(venues, eq(venues.id, productions.venueId))
        .innerJoin(regions, eq(regions.id, venues.regionId))
        .where(
          and(
            eq(productions.companyId, companyId),
            gte(productions.endDate, sql`current_date - ${LOOKBACK_DAYS}::int`),
          ),
        );
      if (rows.length === 0) return [];

      const perfRows = await db
        .select({ productionId: performances.productionId, startsAt: performances.startsAt })
        .from(performances)
        .where(
          inArray(
            performances.productionId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(performances.startsAt));
      const byProduction = new Map<string, Date[]>();
      for (const p of perfRows) {
        const list = byProduction.get(p.productionId) ?? [];
        list.push(p.startsAt);
        byProduction.set(p.productionId, list);
      }
      return rows.map((r): DedupProduction => ({
        ...r,
        performances: byProduction.get(r.id) ?? [],
      }));
    },
  };
}
