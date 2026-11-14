import type { Db } from '@curtainly/shared/db';
import { filterRules } from '@curtainly/shared/db/schema';
import type { FilterRuleStore } from './filter';

/** FilterRuleStore backed by `filter_rules`. */
export function dbFilterRules(db: Db): FilterRuleStore {
  return {
    async loadRules() {
      return db
        .select({
          id: filterRules.id,
          sourceId: filterRules.sourceId,
          keyword: filterRules.keyword,
        })
        .from(filterRules);
    },
  };
}
