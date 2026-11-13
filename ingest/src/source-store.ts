import type { Db } from '@curtainly/shared/db';
import { sources } from '@curtainly/shared/db/schema';
import { and, eq, notInArray } from 'drizzle-orm';
import { NON_ADAPTER_KINDS, type SourceStore, type StoredSource } from './run';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SourceStore backed by the `sources` table. */
export function dbSourceStore(db: Db): SourceStore {
  return {
    async loadSources(id) {
      if (id !== undefined && !UUID.test(id)) throw new Error(`Not a source id: "${id}"`);
      const rows = await db
        .select({
          id: sources.id,
          companyId: sources.companyId,
          kind: sources.kind,
          config: sources.config,
          enabled: sources.enabled,
          autoApprove: sources.autoApprove,
          lastItemsAt: sources.lastItemsAt,
        })
        .from(sources)
        .where(
          id !== undefined
            ? eq(sources.id, id)
            : and(eq(sources.enabled, true), notInArray(sources.kind, [...NON_ADAPTER_KINDS])),
        )
        .orderBy(sources.createdAt);
      return rows satisfies StoredSource[];
    },

    async recordRun(id, update) {
      await db.update(sources).set(update).where(eq(sources.id, id));
    },
  };
}
