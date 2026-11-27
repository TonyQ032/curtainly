import type { Db } from '@curtainly/shared/db';
import { productions, regions, venues } from '@curtainly/shared/db/schema';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { ArchiveStore } from './archive';

/** ArchiveStore backed by `productions`; a production's Region is its venue's. */
export function dbArchiveStore(db: Db): ArchiveStore {
  return {
    async loadRegions() {
      return db
        .select({ id: regions.id, slug: regions.slug, timezone: regions.timezone })
        .from(regions)
        .orderBy(regions.slug);
    },

    async archiveEndedBefore(regionId, today) {
      const venueIds = db
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.regionId, regionId));
      return db
        .update(productions)
        .set({ status: 'archived' })
        .where(
          and(
            eq(productions.status, 'published'),
            lt(productions.endDate, today),
            inArray(productions.venueId, venueIds),
          ),
        )
        .returning({ id: productions.id, slug: productions.slug, endDate: productions.endDate });
    },
  };
}
